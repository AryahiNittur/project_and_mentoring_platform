import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal
from typing import Literal
from uuid import UUID

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator, field_validator

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
app = FastAPI(title='Bridge AWS team builder')
log = logging.getLogger('bridge')


def database():
    return boto3.resource('dynamodb', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-2'),
                          config=Config(connect_timeout=4, read_timeout=8, retries={'max_attempts': 2}))


def table(name):
    return database().Table(name)


def scan_all(name):
    rows, options = [], {'ConsistentRead': True}
    while True:
        result = table(name).scan(**options)
        rows.extend(result.get('Items', []))
        if not result.get('LastEvaluatedKey'):
            return rows
        options['ExclusiveStartKey'] = result['LastEvaluatedKey']


def get_record(name, key):
    row = table(name).get_item(Key={'pk': key}, ConsistentRead=True).get('Item')
    if row is None:
        raise HTTPException(404, f'{name} record not found.')
    return row


def unavailable(error):
    code = error.response['Error']['Code'] if isinstance(error, ClientError) else type(error).__name__
    log.error('AWS error: %s', code)
    return HTTPException(503, 'The workspace service could not complete this request. Check the backend terminal and retry.')


def jsonable(value):
    """Turn DynamoDB Decimals into JSON numbers without changing strings like "8+"."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    return value



@app.get('/api/students/{student_id}')
def get_student(student_id: int):
    try:
        student = get_record('Students', f'student#{student_id}')
        student.setdefault('id', student_id)
        student.setdefault('learn', [])
        return jsonable(student)
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/students')
def get_students():
    try:
        # Public recommendation fields only: do not expose other students' emails or drafts.
        fields = ('id', 'name', 'year', 'major', 'languages', 'interests', 'learn', 'experience', 'hours_per_week', 'bio')
        return jsonable([{key: row[key] for key in fields if key in row}
                for row in scan_all('Students') if 'id' in row])
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/projects')
def get_projects():
    try:
        return jsonable(sorted([p for p in scan_all('Projects') if p.get('spots', 0) > 0], key=lambda p: int(p['id'])))
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


class StudentUpdate(BaseModel):
    goal: Literal["Join a project", "Mentor others", "Both"] = "Both"
    languages: list[str] = Field(min_length=1, max_length=20)
    interests: list[str] = Field(min_length=1, max_length=20)
    learn: list[str] = Field(default_factory=list, max_length=20)
    year: str = Field(default="", max_length=40)
    major: str = Field(default="", max_length=80)
    experience: int = Field(ge=1, le=5)
    hours_per_week: Literal[2, 4, 6, 8, "8+"]

    @field_validator("languages", "interests", "learn")
    @classmethod
    def clean_tags(cls, values):
        cleaned = [item.strip() for item in values if str(item).strip()]
        return cleaned

    @field_validator("year", "major")
    @classmethod
    def clean_text(cls, value):
        return value.strip()

    @field_validator("languages", "interests")
    @classmethod
    def require_one(cls, values):
        if not values:
            raise ValueError("Choose at least one.")
        return values


@app.put("/api/students/{student_id}")
def update_student(student_id: int, body: StudentUpdate):
    """The Students table owns the profile. Survey edits write back here."""
    try:
        current = table("Students").get_item(
            Key={"pk": f"student#{student_id}"},
            ConsistentRead=True,
        ).get("Item")
        if current is None:
            raise HTTPException(404, "Student not found.")

        values = body.model_dump()
        table("Students").update_item(
            Key={"pk": f"student#{student_id}"},
            UpdateExpression=(
                "SET languages = :languages, interests = :interests, learn = :learn, "
                "#year = :year, major = :major, experience = :experience, "
                "hours_per_week = :hours, survey_completed = :completed, goal = :goal"
            ),
            ExpressionAttributeNames={"#year": "year"},
            ExpressionAttributeValues={
                ":languages": values["languages"],
                ":interests": values["interests"],
                ":learn": values["learn"],
                ":year": values["year"],
                ":major": values["major"],
                ":experience": values["experience"],
                ":hours": values["hours_per_week"],
                ":completed": True,
                ":goal": values["goal"],
            },
        )
        return get_student(student_id)
    except HTTPException:
        raise
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error



class MatchInput(BaseModel):
    project_id: int = Field(gt=0)
    score: int = Field(ge=0, le=100)


class DeckInput(BaseModel):
    deck_id: UUID
    student_id: int = Field(gt=0)
    matches: list[MatchInput] = Field(max_length=1000)


class SwipeInput(MatchInput):
    event_id: UUID
    deck_id: UUID
    student_id: int = Field(gt=0)
    action: Literal['like', 'pass']


@app.post('/api/decks')
def save_deck(body: DeckInput):
    if len({m.project_id for m in body.matches}) != len(body.matches):
        raise HTTPException(422, 'Duplicate projects in deck.')
    try:
        get_student(body.student_id)
        for match in body.matches:
            item = {'pk': f'deck#{body.deck_id}#project#{match.project_id}',
                    'deck_id': str(body.deck_id), 'student_id': body.student_id,
                    'project_id': match.project_id, 'score': match.score,
                    'action': 'deck_built', 'created_at': datetime.now(timezone.utc).isoformat()}
            try:
                table('Matches').put_item(Item=item, ConditionExpression='attribute_not_exists(pk)')
            except ClientError as error:
                if error.response['Error']['Code'] != 'ConditionalCheckFailedException':
                    raise
                old = get_record('Matches', item['pk'])
                if any(old.get(k) != item[k] for k in ('student_id', 'project_id', 'score')):
                    raise HTTPException(409, 'Deck ID was reused with different data.')
        return {'saved': len(body.matches)}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.post('/api/swipes')
def save_swipe(body: SwipeInput):
    try:
        fields = body.model_dump(mode='json')
        key = f'event#{body.event_id}'
        old = table('Swipes').get_item(Key={'pk': key}, ConsistentRead=True).get('Item')
        if old:
            if any(old.get(k) != v for k, v in fields.items()):
                raise HTTPException(409, 'Event ID was reused with different data.')
            return {'saved': True, 'duplicate': True}
        match = table('Matches').get_item(Key={'pk': f'deck#{body.deck_id}#project#{body.project_id}'}, ConsistentRead=True).get('Item')
        if not match or int(match['student_id']) != body.student_id or int(match['project_id']) != body.project_id or int(match['score']) != body.score:
            raise HTTPException(409, 'Swipe must match a saved deck score.')
        item = {'pk': key, **fields, 'created_at': datetime.now(timezone.utc).isoformat()}
        serializer = TypeSerializer()
        encoded = {k: serializer.serialize(v) for k, v in item.items()}
        # A standalone low-level client expects typed DynamoDB attributes.
        client = boto3.client('dynamodb', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-2'),
                              config=Config(connect_timeout=4, read_timeout=8, retries={'max_attempts': 2}))
        client.transact_write_items(TransactItems=[{'Put': {
            'TableName': name, 'Item': encoded, 'ConditionExpression': 'attribute_not_exists(pk)'
        }} for name in ('Matches', 'Swipes')])
        return {'saved': True, 'duplicate': False}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/students/{student_id}/history')
def get_history(student_id: int):
    try:
        rows = sorted([r for r in scan_all('Swipes') if r.get('student_id') == student_id],
                      key=lambda r: (r['created_at'], r['pk']))
        latest = {int(r['project_id']): r['action'] for r in rows}
        return {'passed_ids': [k for k, v in latest.items() if v == 'pass'],
                'liked_ids': [k for k, v in latest.items() if v == 'like']}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


class TeamInput(BaseModel):
    project_id: int = Field(gt=0)
    slots: list[int] = Field(max_length=4)
    kept: list[int] = Field(max_length=4)
    seen: list[int] = Field(default_factory=list, max_length=10000)
    round: int = Field(ge=0, le=100000)

    @model_validator(mode='after')
    def valid_members(self):
        if len(set(self.slots)) != len(self.slots) or len(set(self.kept)) != len(self.kept):
            raise ValueError('Duplicate members are not allowed.')
        if not set(self.kept).issubset(self.slots) or any(i <= 0 for i in self.slots):
            raise ValueError('Kept people must belong to the current four recommendations.')
        return self


@app.put('/api/students/{student_id}/team')
def save_team(student_id: int, body: TeamInput):
    try:
        get_student(student_id)
        get_record('Projects', f'project#{body.project_id}')
        for member_id in body.slots:
            if member_id == student_id:
                raise HTTPException(422, 'You cannot recommend yourself.')
            get_student(member_id)
        item = {**body.model_dump(), 'updated_at': datetime.now(timezone.utc).isoformat()}
        table('Students').update_item(Key={'pk': f'student#{student_id}'},
            UpdateExpression='SET dream_team_draft = :draft',
            ConditionExpression='attribute_exists(pk)', ExpressionAttributeValues={':draft': item})
        return {'saved': True, 'draft': item}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


# Community features share existing student records; no new tables are required.
def ensure_map(student_id, field):
    table('Students').update_item(Key={'pk': f'student#{student_id}'},
        UpdateExpression='SET #field = if_not_exists(#field, :empty)',
        ConditionExpression='attribute_exists(pk)',
        ExpressionAttributeNames={'#field': field}, ExpressionAttributeValues={':empty': {}})


def atomic_updates(updates):
    serializer = TypeSerializer()
    encoded = []
    for update in updates:
        update = dict(update)
        update['Key'] = {k: serializer.serialize(v) for k, v in update['Key'].items()}
        update['ExpressionAttributeValues'] = {k: serializer.serialize(v) for k, v in update['ExpressionAttributeValues'].items()}
        encoded.append({'Update': update})
    boto3.client('dynamodb', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-2')).transact_write_items(TransactItems=encoded)


class ConnectionInput(BaseModel):
    event_id: UUID
    project_id: int = Field(gt=0)
    member_ids: list[int] = Field(min_length=1, max_length=4)
    message: str = Field(min_length=1, max_length=1000)


@app.post('/api/students/{student_id}/connection-requests')
def send_connections(student_id: int, body: ConnectionInput):
    try:
        sender = get_student(student_id)
        project = get_record('Projects', f'project#{body.project_id}')
        ids = body.member_ids
        if len(set(ids)) != len(ids) or student_id in ids or any(i <= 0 for i in ids):
            raise HTTPException(422, 'Choose distinct teammates other than yourself.')
        draft = sender.get('dream_team_draft', {})
        if draft.get('project_id') != body.project_id or set(draft.get('kept', [])) != set(ids):
            raise HTTPException(409, 'Save this team before sending connection requests.')
        keys = [f'{body.event_id}#{member_id}' for member_id in ids]
        existing = sender.get('connection_requests', {})
        if all(key in existing for key in keys):
            if any(existing[key]['message'] != body.message or existing[key]['project_id'] != body.project_id for key in keys):
                raise HTTPException(409, 'Request ID reused with different data.')
            return {'saved': True, 'duplicate': True, 'requests': [existing[key] for key in keys]}
        ensure_map(student_id, 'connection_requests')
        values, names, assignments, updates, records = {}, {'#requests': 'connection_requests'}, [], [], []
        created = datetime.now(timezone.utc).isoformat()
        for index, (member_id, key) in enumerate(zip(ids, keys)):
            peer = get_student(member_id)
            ensure_map(member_id, 'connection_inbox')
            record = {'id': key, 'from_id': student_id, 'from_name': sender['name'],
                'to_id': member_id, 'to_name': peer['name'], 'project_id': body.project_id,
                'project_title': project['title'], 'message': body.message, 'status': 'pending', 'created_at': created}
            records.append(record)
            names[f'#r{index}'] = key; values[f':r{index}'] = record
            assignments.append(f'#requests.#r{index} = :r{index}')
            updates.append({'TableName': 'Students', 'Key': {'pk': f'student#{member_id}'},
                'UpdateExpression': 'SET #inbox.#key = :record',
                'ConditionExpression': 'attribute_exists(pk) AND attribute_not_exists(#inbox.#key)',
                'ExpressionAttributeNames': {'#inbox': 'connection_inbox', '#key': key},
                'ExpressionAttributeValues': {':record': record}})
        updates.append({'TableName': 'Students', 'Key': {'pk': f'student#{student_id}'},
            'UpdateExpression': 'SET ' + ', '.join(assignments),
            'ConditionExpression': 'attribute_exists(pk) AND ' + ' AND '.join(f'attribute_not_exists(#requests.#r{i})' for i in range(len(ids))),
            'ExpressionAttributeNames': names, 'ExpressionAttributeValues': values})
        atomic_updates(updates)
        return {'saved': True, 'duplicate': False, 'requests': records}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


class ReplyInput(BaseModel):
    sender_id: int = Field(gt=0)
    decision: Literal['accepted', 'declined']


@app.put('/api/students/{student_id}/connection-requests/{request_id}')
def reply_connection(student_id: int, request_id: str, body: ReplyInput):
    try:
        student = get_student(student_id)
        request = student.get('connection_inbox', {}).get(request_id)
        if not request or request['from_id'] != body.sender_id:
            raise HTTPException(404, 'Connection request not found.')
        if request['status'] != 'pending':
            if request['status'] != body.decision:
                raise HTTPException(409, 'This connection request was already answered.')
            return {'saved': True, 'duplicate': True}
        answered = datetime.now(timezone.utc).isoformat()
        updates = []
        for owner, field in ((student_id, 'connection_inbox'), (body.sender_id, 'connection_requests')):
            updates.append({'TableName': 'Students', 'Key': {'pk': f'student#{owner}'},
                'UpdateExpression': 'SET #field.#key.#status = :status, #field.#key.answered_at = :time',
                'ConditionExpression': '#field.#key.#status = :pending',
                'ExpressionAttributeNames': {'#field': field, '#key': request_id, '#status': 'status'},
                'ExpressionAttributeValues': {':status': body.decision, ':time': answered, ':pending': 'pending'}})
        atomic_updates(updates)
        return {'saved': True, 'duplicate': False}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


class HelpInput(BaseModel):
    project_id: int = Field(gt=0)


@app.post('/api/students/{student_id}/help-offers')
def offer_help(student_id: int, body: HelpInput):
    try:
        get_student(student_id)
        project = get_record('Projects', f'project#{body.project_id}')
        ensure_map(student_id, 'help_offers')
        item = {'project_id': body.project_id, 'title': project['title'],
                'created_at': datetime.now(timezone.utc).isoformat(), 'status': 'offered'}
        table('Students').update_item(Key={'pk': f'student#{student_id}'},
            UpdateExpression='SET help_offers.#key = if_not_exists(help_offers.#key, :offer)',
            ExpressionAttributeNames={'#key': str(body.project_id)}, ExpressionAttributeValues={':offer': item})
        return {'saved': True}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.post('/api/students/{student_id}/help-offers/{project_id}/demo-confirm')
def confirm_demo_help(student_id: int, project_id: int):
    try:
        student = get_student(student_id)
        if str(project_id) not in student.get('help_offers', {}):
            raise HTTPException(404, 'Offer help before simulating a confirmation.')
        table('Students').update_item(Key={'pk': f'student#{student_id}'},
            UpdateExpression='SET help_offers.#key.#status = :status, help_offers.#key.confirmed_at = if_not_exists(help_offers.#key.confirmed_at, :time), help_offers.#key.demo = :demo',
            ExpressionAttributeNames={'#key': str(project_id), '#status': 'status'},
            ExpressionAttributeValues={':status': 'confirmed', ':time': datetime.now(timezone.utc).isoformat(), ':demo': True})
        return {'saved': True}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


class EndorsementInput(BaseModel):
    event_id: UUID
    author: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=15, max_length=600)


@app.post('/api/students/{student_id}/endorsements')
def add_demo_endorsement(student_id: int, body: EndorsementInput):
    try:
        get_student(student_id)
        ensure_map(student_id, 'endorsements')
        item = {'author': body.author, 'text': body.text, 'demo': True,
                'created_at': datetime.now(timezone.utc).isoformat()}
        table('Students').update_item(Key={'pk': f'student#{student_id}'},
            UpdateExpression='SET endorsements.#key = if_not_exists(endorsements.#key, :review)',
            ExpressionAttributeNames={'#key': str(body.event_id)}, ExpressionAttributeValues={':review': item})
        return {'saved': True}
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/community')
def get_community():
    try:
        return jsonable([{'id': row['id'], 'name': row.get('name', 'Community member'),
            'major': row.get('major', ''), 'year': row.get('year', ''),
            'helps': sum(1 for offer in row.get('help_offers', {}).values() if offer.get('status') == 'confirmed'),
            'demo_helps': sum(1 for offer in row.get('help_offers', {}).values() if offer.get('status') == 'confirmed' and offer.get('demo'))}
            for row in scan_all('Students') if 'id' in row])
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


# Static hosting goes last, so it cannot intercept API routes.
app.mount('/', StaticFiles(directory=ROOT / 'frontend', html=True), name='frontend')
