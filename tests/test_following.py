from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_x_following import sync_following

NOW=datetime(2026,10,21,10,tzinfo=timezone.utc)
CONFIG={'enabled':False,'monthlyBudgetUsd':5,'followingSync':{'enabled':True,'owner':'example','pageSize':2},
        'usernames':['old','extra'],'followingImport':{'count':1},
        'candidates':[{'username':'old','origin':'following'},{'username':'extra','origin':'curated','name':'Extra'}]}
OWNER={'data':{'id':'123','username':'example','public_metrics':{'following_count':2}}}
PAGE1={'data':[{'username':'first','name':'First'}],'meta':{'result_count':1,'next_token':'next'}}
PAGE2={'data':[{'username':'second','name':'Second'}],'meta':{'result_count':1}}

class FollowingTests(unittest.TestCase):
    def test_disabled_missing_credentials_and_zero_budget_make_no_requests(self):
        api=Mock(side_effect=AssertionError('Paid call not authorized'))
        for config,token in [(dict(CONFIG,followingSync={'enabled':False}),'token'),(CONFIG,''),(dict(CONFIG,monthlyBudgetUsd=0),'token')]:
            result=sync_following(config,{}, {},token,NOW,api=api)
            self.assertIsNone(result['snapshot'])
            self.assertEqual(result['config'],config)
        api.assert_not_called()

    def test_complete_paginated_snapshot_replaces_removed_accounts_and_retains_extras(self):
        api=Mock(side_effect=[OWNER,PAGE1,PAGE2])
        with tempfile.TemporaryDirectory() as folder:
            result=sync_following(CONFIG,{}, {},'token',NOW,api=api,root=Path(folder))
        self.assertEqual(result['status']['status'],'ok')
        self.assertEqual(result['config']['usernames'],['first','second','extra'])
        self.assertEqual(len(result['snapshot']['accounts']),2)
        self.assertEqual(api.call_args.args[0],'users/123/following')
        self.assertEqual(api.call_args.args[1]['pagination_token'],'next')
        self.assertNotIn('old',result['config']['usernames'])
        self.assertEqual(CONFIG['usernames'],['old','extra'])

    def test_partial_duplicate_mismatched_or_failed_pages_do_not_delete_prior_relationships(self):
        cases=[([OWNER,PAGE1],dict(CONFIG,followingSync={'enabled':True,'owner':'example','pageSize':2,'maxPages':1})),
               ([OWNER,PAGE1,dict(PAGE2,data=[{'username':'first'}])],CONFIG),
               ([OWNER,dict(PAGE2)],CONFIG),
               ([OWNER,PAGE1,ValueError('failed page')],CONFIG),
               ([OWNER,{'data':[],'meta':{'result_count':0},'errors':[{}]}],CONFIG)]
        for responses,config in cases:
            with self.subTest(responses=responses),tempfile.TemporaryDirectory() as folder:
                result=sync_following(config,{}, {},'token',NOW,api=Mock(side_effect=responses),root=Path(folder))
                self.assertNotEqual(result['status']['status'],'ok')
                self.assertIsNone(result['snapshot'])
                self.assertEqual(result['config']['usernames'],['old','extra'])

    def test_budget_guard_and_one_sync_per_half_day(self):
        api=Mock(return_value=OWNER)
        with tempfile.TemporaryDirectory() as folder:
            result=sync_following(dict(CONFIG,monthlyBudgetUsd=.01),{}, {},'token',NOW,api=api,root=Path(folder))
        self.assertEqual(result['status']['status'],'budget_limited')
        self.assertEqual(api.call_count,1)  # Owner reserved; following page never called.
        api.reset_mock()
        result=sync_following(CONFIG,{'lastSuccessAt':'2026-10-20T23:43:00+00:00'}, {},'token',NOW,api=api)
        self.assertTrue(result['status']['skippedAlreadySynced'])
        api.assert_not_called()

    def test_delayed_morning_run_does_not_skip_evening_and_midnight_does_not_repeat(self):
        # 09:00 Beijing morning success; the 19:43 evening run must execute.
        morning={'lastSuccessAt':'2026-10-21T01:00:00+00:00'}
        evening=datetime(2026,10,21,11,43,tzinfo=timezone.utc)
        api=Mock(side_effect=[OWNER,PAGE1,PAGE2])
        with tempfile.TemporaryDirectory() as folder:
            result=sync_following(CONFIG,morning,{},'token',evening,api=api,root=Path(folder))
        self.assertEqual(result['status']['status'],'ok')
        self.assertEqual(api.call_count,3)
        # 00:10 next calendar day is still in the same evening window.
        api.reset_mock()
        midnight=datetime(2026,10,21,16,10,tzinfo=timezone.utc)
        result=sync_following(CONFIG,{'lastSuccessAt':evening.isoformat()}, {},'token',midnight,api=api)
        self.assertTrue(result['status']['skippedAlreadySynced'])
        api.assert_not_called()

    def test_verified_empty_list_removes_followed_accounts_but_not_extras(self):
        owner={'data':dict(OWNER['data'],public_metrics={'following_count':0})}
        with tempfile.TemporaryDirectory() as folder:
            result=sync_following(CONFIG,{}, {},'token',NOW,api=Mock(side_effect=[owner,{'meta':{'result_count':0}}]),root=Path(folder))
        self.assertEqual(result['status']['status'],'ok')
        self.assertEqual(result['config']['usernames'],['extra'])

if __name__=='__main__':unittest.main()
