import os
import unittest
from unittest.mock import patch
from uuid import uuid4

import boto3
from fastapi.testclient import TestClient
from moto import mock_aws

from backend.main import app


class BridgeApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'AWS_ACCESS_KEY_ID': 'testing', 'AWS_SECRET_ACCESS_KEY': 'testing',
                                          'AWS_SESSION_TOKEN': 'testing', 'AWS_DEFAULT_REGION': 'us-east-2'})
        self.env.start()
        self.aws = mock_aws()
        self.aws.start()
        self.db = boto3.resource('dynamodb', region_name='us-east-2')
        for name in ('Students', 'Projects', 'Matches', 'Swipes'):
            self.db.create_table(TableName=name, KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}],
                                 AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}],
                                 BillingMode='PAY_PER_REQUEST')
        for student_id in range(1, 8):
            self.db.Table('Students').put_item(Item={
                'pk': f'student#{student_id}', 'id': student_id, 'name': f'Student {student_id}',
                'languages': ['Python'], 'interests': ['Robotics'], 'learn': ['Robotics'],
                'experience': 3, 'hours_per_week': 6, 'email': 'private@example.com',
                'dream_team_draft': {'private': True},
            })
        self.db.Table('Projects').put_item(Item={'pk': 'project#1', 'id': 1, 'title': 'Build a robot', 'spots': 4})
        self.db.Table('Projects').put_item(Item={'pk': 'project#2', 'id': 2, 'title': 'Closed', 'spots': 0})
        self.client = TestClient(app)

    def tearDown(self):
        self.aws.stop()
        self.env.stop()

    def deck(self):
        deck_id = str(uuid4())
        self.assertEqual(self.client.post('/api/decks', json={
            'deck_id': deck_id, 'student_id': 1, 'matches': [{'project_id': 1, 'score': 90}]
        }).status_code, 200)
        return deck_id

    def test_reads_students_and_open_projects_without_exposing_peer_emails(self):
        self.assertEqual(self.client.get('/api/students/1').json()['id'], 1)
        peers = self.client.get('/api/students').json()
        self.assertEqual(len(peers), 7)
        self.assertNotIn('email', peers[0])
        self.assertNotIn('dream_team_draft', peers[0])
        self.assertEqual([p['id'] for p in self.client.get('/api/projects').json()], [1])

    def test_deck_and_swipe_are_persisted_and_retry_is_idempotent(self):
        deck_id = self.deck()
        body = {'deck_id': deck_id, 'event_id': str(uuid4()), 'student_id': 1,
                'project_id': 1, 'action': 'like', 'score': 90}
        self.assertEqual(self.client.post('/api/swipes', json=body).status_code, 200)
        retry = self.client.post('/api/swipes', json=body)
        self.assertEqual(retry.status_code, 200)
        self.assertTrue(retry.json()['duplicate'])
        self.assertEqual(self.db.Table('Swipes').scan()['Count'], 1)
        rows = self.db.Table('Matches').scan()['Items']
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertTrue(all(key in row for key in ('student_id', 'project_id', 'action', 'score', 'created_at')))
        self.assertEqual(self.client.get('/api/students/1/history').json()['liked_ids'], [1])
        self.assertEqual(self.client.post('/api/swipes', json={**body, 'action': 'pass'}).status_code, 409)

    def test_invalid_swipe_never_writes_either_table(self):
        deck_id = self.deck()
        response = self.client.post('/api/swipes', json={'deck_id': deck_id, 'event_id': str(uuid4()),
            'student_id': 1, 'project_id': 1, 'action': 'like', 'score': 12})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.Table('Swipes').scan()['Count'], 0)
        self.assertEqual(self.db.Table('Matches').scan()['Count'], 1)

    def test_draft_roundtrip_preserves_student_and_kept_slots(self):
        draft = {'project_id': 1, 'slots': [2, 3, 4, 5], 'kept': [2, 4], 'round': 2, 'seen': [2, 3, 4, 5, 6, 7]}
        response = self.client.put('/api/students/1/team', json=draft)
        self.assertEqual(response.status_code, 200, response.text)
        student = self.client.get('/api/students/1').json()
        self.assertEqual(student['languages'], ['Python'])
        self.assertEqual(student['dream_team_draft']['kept'], [2, 4])
        self.assertEqual(student['dream_team_draft']['seen'], draft['seen'])

    def test_invalid_team_members_are_rejected(self):
        draft = {'project_id': 1, 'slots': [2, 3, 4, 5], 'kept': [2], 'round': 0}
        for changed in ({'slots': [2, 2]}, {'slots': [1, 2]}, {'kept': [7]},
                        {'slots': [2, 3, 4, 5, 6]}, {'slots': [999]}, {'project_id': 999}):
            with self.subTest(changed=changed):
                self.assertIn(self.client.put('/api/students/1/team', json={**draft, **changed}).status_code, (404, 422))

    def test_team_requests_reach_every_inbox_and_retries_do_not_duplicate(self):
        self.client.put('/api/students/1/team', json={'project_id': 1, 'slots': [2,3,4,5], 'kept': [2,3,4,5], 'round': 1})
        body = {'event_id': str(uuid4()), 'project_id': 1, 'member_ids': [2,3,4,5], 'message': 'Let us build a robot together.'}
        result = self.client.post('/api/students/1/connection-requests', json=body)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(len(result.json()['requests']), 4)
        self.assertTrue(self.client.post('/api/students/1/connection-requests', json=body).json()['duplicate'])
        for member_id in (2,3,4,5):
            inbox = self.client.get(f'/api/students/{member_id}').json()['connection_inbox']
            self.assertEqual(len(inbox), 1)
            self.assertEqual(next(iter(inbox.values()))['from_id'], 1)
            self.assertEqual(next(iter(inbox.values()))['status'], 'pending')
        sender = self.client.get('/api/students/1').json()
        self.assertEqual(len(sender['connection_requests']), 4)
        self.assertNotIn('help_offers', sender)
        request_id = result.json()['requests'][0]['id']
        response = self.client.put(f'/api/students/2/connection-requests/{request_id.replace("#", "%23")}', json={'sender_id': 1, 'decision': 'accepted'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get('/api/students/1').json()['connection_requests'][request_id]['status'], 'accepted')
        self.assertEqual(self.client.get('/api/students/2').json()['connection_inbox'][request_id]['status'], 'accepted')

    def test_connection_requests_require_saved_team(self):
        body = {'event_id': str(uuid4()), 'project_id': 1, 'member_ids': [2,3,4,5], 'message': 'Build together'}
        self.assertEqual(self.client.post('/api/students/1/connection-requests', json=body).status_code, 409)
        self.assertNotIn('connection_inbox', self.client.get('/api/students/2').json())

    def test_help_credit_requires_confirmation_and_counts_once(self):
        self.assertEqual(self.client.post('/api/students/1/help-offers', json={'project_id': 1}).status_code, 200)
        rows = self.client.get('/api/community').json()
        self.assertEqual(next(r for r in rows if r['id'] == 1)['helps'], 0)
        for _ in range(2):
            response = self.client.post('/api/students/1/help-offers/1/demo-confirm', json={})
            self.assertEqual(response.status_code, 200, response.text)
        rows = self.client.get('/api/community').json()
        current = next(r for r in rows if r['id'] == 1)
        self.assertEqual(current['helps'], 1)
        self.assertEqual(current['demo_helps'], 1)
        self.assertEqual(self.client.post('/api/students/1/help-offers/999/demo-confirm', json={}).status_code, 404)

    def test_demo_endorsement_is_labeled_and_saved_without_overwriting_profile(self):
        body = {'event_id': str(uuid4()), 'author': 'Jamie', 'text': 'Helped me understand our robot project.'}
        for _ in range(2):
            self.assertEqual(self.client.post('/api/students/1/endorsements', json=body).status_code, 200)
        student = self.client.get('/api/students/1').json()
        self.assertEqual(student['languages'], ['Python'])
        self.assertEqual(len(student['endorsements']), 1)
        self.assertTrue(next(iter(student['endorsements'].values()))['demo'])

    def test_demo_reset_reopens_the_survey_and_clears_only_that_students_choices(self):
        self.client.put('/api/students/1', json={
            'languages': ['Python'], 'interests': ['Robotics'], 'learn': ['Robotics'],
            'year': 'Junior', 'major': 'Engineering', 'experience': 3, 'hours_per_week': 6,
        })
        deck_id = self.deck()
        self.assertEqual(self.client.post('/api/swipes', json={
            'deck_id': deck_id, 'event_id': str(uuid4()), 'student_id': 1,
            'project_id': 1, 'action': 'pass', 'score': 90,
        }).status_code, 200)
        self.assertEqual(self.client.put('/api/students/1/team', json={
            'project_id': 1, 'slots': [2, 3, 4, 5], 'kept': [2], 'round': 1, 'seen': [2, 3, 4, 5],
        }).status_code, 200)
        other_deck = str(uuid4())
        self.assertEqual(self.client.post('/api/decks', json={
            'deck_id': other_deck, 'student_id': 2, 'matches': [{'project_id': 1, 'score': 90}],
        }).status_code, 200)
        self.assertEqual(self.client.post('/api/swipes', json={
            'deck_id': other_deck, 'event_id': str(uuid4()), 'student_id': 2,
            'project_id': 1, 'action': 'like', 'score': 90,
        }).status_code, 200)
        reset = self.client.post('/api/students/1/demo-reset')
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertEqual(reset.json()['swipes_cleared'], 1)
        student = self.client.get('/api/students/1').json()
        self.assertIs(student['survey_completed'], False)
        self.assertNotIn('dream_team_draft', student)
        self.assertEqual(student['languages'], ['Python'])
        self.assertEqual(student['name'], 'Student 1')
        self.assertEqual(self.client.get('/api/students/1/history').json(), {'passed_ids': [], 'liked_ids': []})
        self.assertEqual(self.client.get('/api/students/2/history').json()['liked_ids'], [1])
        self.assertEqual(self.client.post('/api/students/999/demo-reset').status_code, 404)

    def test_frontend_is_served_after_api_routes(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertIn('matching/rank.js', self.client.get('/').text)
        self.assertIn('function refreshPeople', self.client.get('/app.js').text)


if __name__ == '__main__':
    unittest.main()
