import os
import unittest
from decimal import Decimal
from uuid import uuid4

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")

import boto3
from fastapi.testclient import TestClient
from moto import mock_aws

from backend.main import app, jsonable


STUDENT = {
    "pk": "student#1",
    "id": 1,
    "name": "Aryahi Nittur",
    "email": "aryahi.nittur@gmail.com",
    "languages": ["Python"],
    "interests": ["Machine Learning"],
    "learn": ["AI"],
    "year": "Junior",
    "major": "Computer Science",
    "experience": 3,
    "hours_per_week": "8+",
}


def create_tables():
    client = boto3.client("dynamodb", region_name="us-east-2")
    for name in ("Students", "Projects", "Matches", "Swipes"):
        client.create_table(
            TableName=name,
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )


def seed():
    dynamo = boto3.resource("dynamodb", region_name="us-east-2")
    dynamo.Table("Students").put_item(Item=STUDENT)
    dynamo.Table("Projects").put_item(
        Item={
            "pk": "project#1",
            "id": 1,
            "title": "Campus energy",
            "org": "Honda",
            "description": "Track building energy use.",
            "languages": ["Python"],
            "interests": ["Machine Learning", "Sustainability"],
            "learn_outcomes": ["AI"],
            "target_experience": 3,
            "hours_per_week": 4,
            "weeks": 6,
            "spots": Decimal("2"),
            "majors": ["Computer Science"],
            "mentor": "Priya Shah",
        }
    )
    dynamo.Table("Projects").put_item(
        Item={
            "pk": "project#2",
            "id": 2,
            "title": "Full project",
            "description": "No seats left.",
            "languages": ["Python"],
            "interests": ["Data"],
            "learn_outcomes": ["Data"],
            "target_experience": 3,
            "hours_per_week": 4,
            "weeks": 4,
            "spots": 0,
            "mentor": "Alex Kim",
        }
    )


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.aws = mock_aws()
        self.aws.start()
        create_tables()
        seed()
        self.client = TestClient(app)

    def tearDown(self):
        self.aws.stop()

    def test_hours_string_survives_json(self):
        student = self.client.get("/api/students/1")
        self.assertEqual(student.status_code, 200)
        body = student.json()
        self.assertEqual(body["hours_per_week"], "8+")
        self.assertEqual(body["experience"], 3)
        self.assertIsInstance(body["experience"], int)

    def test_closed_projects_are_hidden_and_decimals_become_ints(self):
        projects = self.client.get("/api/projects").json()
        self.assertEqual([project["id"] for project in projects], [1])
        self.assertEqual(projects[0]["spots"], 2)
        self.assertEqual(projects[0]["description"], "Track building energy use.")
        self.assertEqual(projects[0]["mentor"], "Priya Shah")

    def test_survey_writes_back_and_keeps_eight_plus(self):
        saved = self.client.put(
            "/api/students/1",
            json={
                "languages": ["Python", "SQL"],
                "interests": ["Data"],
                "learn": ["Healthcare"],
                "year": "Senior",
                "major": "Data Science",
                "experience": 4,
                "hours_per_week": "8+",
            },
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        body = saved.json()
        self.assertEqual(body["hours_per_week"], "8+")
        self.assertEqual(body["interests"], ["Data"])
        self.assertEqual(body["name"], "Aryahi Nittur")
        again = self.client.get("/api/students/1").json()
        self.assertEqual(again["major"], "Data Science")
        self.assertEqual(again["experience"], 4)

    def test_swipe_requires_the_same_deck_score(self):
        deck_id = str(uuid4())
        created = self.client.post(
            "/api/decks",
            json={
                "deck_id": deck_id,
                "student_id": 1,
                "matches": [{"project_id": 1, "score": 80}],
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["saved"], 1)

        early = self.client.post(
            "/api/swipes",
            json={
                "event_id": str(uuid4()),
                "deck_id": str(uuid4()),
                "student_id": 1,
                "project_id": 1,
                "action": "pass",
                "score": 80,
            },
        )
        self.assertEqual(early.status_code, 409)

        event_id = str(uuid4())
        swipe = {
            "event_id": event_id,
            "deck_id": deck_id,
            "student_id": 1,
            "project_id": 1,
            "action": "like",
            "score": 80,
        }
        saved = self.client.post("/api/swipes", json=swipe)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json(), {"saved": True, "duplicate": False})

        mismatch = dict(swipe, event_id=str(uuid4()), score=79)
        self.assertEqual(self.client.post("/api/swipes", json=mismatch).status_code, 409)

        duplicate = self.client.post("/api/swipes", json=swipe)
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        self.assertEqual(duplicate.json()["duplicate"], True)

        dynamo = boto3.resource("dynamodb", region_name="us-east-2")
        swipe_item = dynamo.Table("Swipes").get_item(Key={"pk": f"event#{event_id}"})["Item"]
        match_item = dynamo.Table("Matches").get_item(Key={"pk": f"event#{event_id}"})["Item"]
        self.assertEqual(swipe_item["action"], "like")
        self.assertEqual(int(swipe_item["score"]), 80)
        self.assertEqual(match_item["project_id"], swipe_item["project_id"])

    def test_jsonable_leaves_hour_strings_alone(self):
        self.assertEqual(jsonable({"hours_per_week": "8+", "spots": Decimal("2")}), {"hours_per_week": "8+", "spots": 2})


if __name__ == "__main__":
    unittest.main()
