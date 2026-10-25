import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

app = FastAPI()
logger = logging.getLogger("bridge")


def database():
    return boto3.resource(
        "dynamodb",
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-2"),
    )


def table(name):
    return database().Table(name)


def read_all(dynamo_table):
    items = []
    options = {"ConsistentRead": True}

    while True:
        response = dynamo_table.scan(**options)
        items.extend(response.get("Items", []))

        if not response.get("LastEvaluatedKey"):
            return items

        options["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def database_error(error):
    logger.error("DynamoDB error: %s", type(error).__name__)
    return HTTPException(
        status_code=503,
        detail="DynamoDB request failed. Check the backend terminal, credentials, and table permissions.",
    )


@app.get("/api/projects")
def get_projects():
    try:
        projects = read_all(table("Projects"))

        return sorted(
            [project for project in projects if project.get("spots", 0) > 0],
            key=lambda project: int(project["id"]),
        )
    except (BotoCoreError, ClientError) as error:
        raise database_error(error) from error


@app.get("/api/students/{student_id}")
def get_student(student_id: int):
    try:
        student = table("Students").get_item(
            Key={"pk": f"student#{student_id}"},
            ConsistentRead=True,
        ).get("Item")

        if student is None:
            raise HTTPException(404, "Student not found.")

        return student

    except (BotoCoreError, ClientError) as error:
        raise database_error(error) from error


class MatchInput(BaseModel):
    project_id: int = Field(gt=0)
    score: int = Field(ge=0, le=100)


class DeckInput(BaseModel):
    deck_id: UUID
    student_id: int = Field(gt=0)
    matches: list[MatchInput] = Field(max_length=100)


class SwipeInput(BaseModel):
    event_id: UUID
    deck_id: UUID
    student_id: int = Field(gt=0)
    project_id: int = Field(gt=0)
    action: Literal["like", "pass"]
    score: int = Field(ge=0, le=100)


@app.post("/api/decks")
def save_deck(body: DeckInput):
    """Save one match snapshot per project when a deck is built."""
    try:
        get_student(body.student_id)
        matches = table("Matches")
        created_at = datetime.now(timezone.utc).isoformat()

        for match in body.matches:
            item = {
                "pk": f"deck#{body.deck_id}#project#{match.project_id}",
                "deck_id": str(body.deck_id),
                "student_id": body.student_id,
                "project_id": match.project_id,
                "action": "deck_built",
                "score": match.score,
                "created_at": created_at,
            }

            try:
                matches.put_item(
                    Item=item,
                    ConditionExpression="attribute_not_exists(pk)",
                )
            except ClientError as error:
                if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                    raise

                existing = matches.get_item(
                    Key={"pk": item["pk"]},
                    ConsistentRead=True,
                )["Item"]

                if any(
                    existing.get(key) != item[key]
                    for key in ("student_id", "project_id", "score")
                ):
                    raise HTTPException(
                        409, "Deck ID already exists with different data."
                    )

        return {"saved": len(body.matches)}

    except (BotoCoreError, ClientError) as error:
        raise database_error(error) from error


@app.post("/api/swipes")
def save_swipe(body: SwipeInput):
    """Save the swipe and its match snapshot together."""
    try:
        matches = table("Matches")
        swipes = table("Swipes")

        event_key = f"event#{body.event_id}"
        fields = body.model_dump(mode="json")

        existing = swipes.get_item(
            Key={"pk": event_key},
            ConsistentRead=True,
        ).get("Item")

        # Retrying the same event does not create another swipe.
        if existing:
            if any(existing.get(key) != value for key, value in fields.items()):
                raise HTTPException(
                    409, "Event ID already exists with different data."
                )

            return {"saved": True, "duplicate": True}

        deck_match = matches.get_item(
            Key={"pk": f"deck#{body.deck_id}#project#{body.project_id}"},
            ConsistentRead=True,
        ).get("Item")

        if (
            deck_match is None
            or deck_match["student_id"] != body.student_id
            or deck_match["score"] != body.score
        ):
            raise HTTPException(
                409, "Build and save the deck before recording this swipe."
            )

        item = {
            "pk": event_key,
            **fields,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Both records are saved, or neither is saved.
        database().meta.client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": "Swipes",
                        "Item": item,
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": "Matches",
                        "Item": item,
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
            ]
        )

        return {"saved": True, "duplicate": False}

    except (BotoCoreError, ClientError) as error:
        raise database_error(error) from error


# Keep frontend hosting AFTER all API routes.
app.mount(
    "/",
    StaticFiles(directory=ROOT / "frontend", html=True),
    name="frontend",
)