import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

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
    return HTTPException(503, f'AWS request failed ({code}). Check credentials, us-east-2 region, and table permissions.')


@app.get('/api/students/{student_id}')
def get_student(student_id: int):
    try:
        return get_record('Students', f'student#{student_id}')
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/students')
def get_students():
    try:
        # Public recommendation fields only: do not expose other students' emails or drafts.
        fields = ('id', 'name', 'year', 'major', 'languages', 'interests', 'learn', 'experience', 'hours_per_week', 'bio')
        return [{key: row[key] for key in fields if key in row}
                for row in scan_all('Students') if 'id' in row]
    except (BotoCoreError, ClientError) as error:
        raise unavailable(error) from error


@app.get('/api/projects')
def get_projects():
    try:
        return sorted([p for p in scan_all('Projects') if p.get('spots', 0) > 0], key=lambda p: int(p['id']))
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
        match = get_record('Matches', f'deck#{body.deck_id}#project#{body.project_id}')
        if match['student_id'] != body.student_id or match['score'] != body.score:
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


# Static hosting goes last, so it cannot intercept API routes.
app.mount('/', StaticFiles(directory=ROOT / 'frontend', html=True), name='frontend')
