from lib.ContestListPage import ContestListPage
from lib.ContestListPageRequestResult import ContestListPageRequestResult
import os
import json
import sys
from decimal import Decimal, ROUND_DOWN
from time import sleep
from datetime import datetime
from typing import Dict, List, Tuple, Union
from requests.exceptions import HTTPError
from requests.models import Response
from requests.sessions import Session

from onlinejudge._implementation.utils import (
    default_cookie_path,
    with_cookiejar,
    get_default_session,
)


# Python JSON serialize a Decimal object - Stack Overflow
# https://stackoverflow.com/questions/1960516/python-json-serialize-a-decimal-object
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)


def get_local_json_path(contest_slug: str = 'arc121', contest_category: str = 'arc') -> str:
    return f'./json/{contest_category}/{contest_slug}.json'


def get_standings(contest_slug: str = 'arc121', contest_category: str = 'arc') -> bool:
    filepath: str = get_local_json_path(contest_slug=contest_slug, contest_category=contest_category)
    if os.path.exists(filepath):
        return False
    sess: Session
    with with_cookiejar(get_default_session(), path=default_cookie_path) as sess:
        res: Response = sess.get(f'https://atcoder.jp/contests/{contest_slug}/standings/json')
        with open(filepath, mode='w') as f:
            f.write(res.text)
    return True


def round_decimal(num: Decimal, n: int) -> Decimal:
    return num.quantize(Decimal(str(10**(n*-1))), rounding=ROUND_DOWN)


def run(contest_slugs: List[str], label: str = 'arc_120m', minutes: int = 120, contest_category: str = 'arc') -> None:
    # download json
    print('## Download standings json', file=sys.stderr)
    for contest_slug in contest_slugs:
        print(f'  -> Check {contest_slug}', file=sys.stderr)
        if get_standings(contest_slug=contest_slug, contest_category=contest_category):
            sleep(5)

    # parse json
    print('## Parse standings json', file=sys.stderr)
    accepted_ratio_dict: Dict[str, List[Decimal]] = {}
    for contest_slug in contest_slugs:
        print(f'### Process {contest_slug}', file=sys.stderr)
        filepath: str = get_local_json_path(contest_slug=contest_slug, contest_category=contest_category)
        with open(filepath, 'r') as f:
            obj: Dict[str, List[dict]] = json.load(f)
        # print(list(obj.keys()))  # => ['Fixed', 'AdditionalColumns', 'TaskInfo', 'StandingsData', 'Translation']
        # print(list(obj['TaskInfo'][0].keys()))  # => ['Assignment', 'TaskName', 'TaskScreenName']
        # print(list(obj['StandingsData'][0].keys()))
        # # => ['Rank', 'Additional', 'UserName', 'UserScreenName', 'UserIsDeleted', 'Affiliation', 'Country',
        #       'Rating', 'OldRating', 'IsRated', 'IsTeam', 'Competitions', 'AtCoderRank', 'TaskResults', 'TotalResult']
        # print(obj['TaskInfo'][0])
        # # => {'Assignment': 'A', 'TaskName': '2nd Greatest Distance', 'TaskScreenName': 'arc121_a'}
        # print(obj['StandingsData'][0]['TaskResults'])
        # # => {'arc121_a': {'Count': 1, 'Failure': 1, 'Penalty': 0, 'Score': 40000, 'Elapsed': 308000000000,
        #                    'Status': 1, 'Pending': False, 'Frozen': False, 'Additional': None}, ...}
        accepted_times_dict: Dict[str, List[int]] = {}
        for task in obj['TaskInfo']:
            accepted_times_dict[task['TaskScreenName']] = []
        sz = len(obj['StandingsData'])
        print('  -> Tasks size = %d' % len(obj['TaskInfo']), file=sys.stderr)
        print(f'  -> Participants size = {sz}', file=sys.stderr)

        for participant in obj['StandingsData']:
            task_results: Dict[str, Dict[str, Union[int, bool, None]]] = participant['TaskResults']
            for task_screen_name, task_result in task_results.items():
                if task_result['Status'] == 1:  # AC
                    elapsed: int = task_result['Elapsed'] // 1000000000
                    accepted_times_dict[task_screen_name].append(elapsed)
        for task_screen_name, accepted_times in accepted_times_dict.items():
            accepted_times.sort()
            # accepted_times_dict[task_screen_name] = []
            accepted_cnts_imos: List[int] = [0 for i in range(minutes)]
            for accepted_time in accepted_times:
                accepted_cnts_imos[accepted_time // 60] += 1
            accepted_cnts = [0]
            for accepted_cnts_imos_elem in accepted_cnts_imos:
                accepted_cnts.append(accepted_cnts[-1] + accepted_cnts_imos_elem)
            accepted_cnts = accepted_cnts[1:]
            accepted_ratio_dict[task_screen_name] = [round_decimal(
                Decimal(cnt) / Decimal(sz), 9) for cnt in accepted_cnts]
        # break
    # print(accepted_ratio_dict['arc121_a'])
    # print(accepted_ratio_dict['arc120_a'])
    # print(accepted_ratio_dict['arc119_a'])
    with open(f'json/standings/{label}.json', mode='wt', encoding='utf-8') as file:
        json.dump(obj=accepted_ratio_dict, fp=file, separators=(',', ':'), cls=DecimalEncoder)


def main_handy() -> None:
    dic: Dict[str, Tuple[int, str, List[str]]] = {
        'agc_150m': (150, 'agc', ['agc048', 'agc046', 'agc045', 'agc044', 'agc043', 'agc041', 'agc040',
                                  'agc039', 'agc037', 'agc033', 'agc028', 'agc026', 'agc022', 'agc019']),
        'arc_120m': (120, 'arc', ['arc121', 'arc120', 'arc119', 'arc118', 'arc117', 'arc116', 'arc115',
                                  'arc114', 'arc113', 'arc112', 'arc111', 'arc110', 'arc109', 'arc104']),
        'arc_100m': (100, 'arc', ['arc108', 'arc107', 'arc106', 'arc105']),
        'abc_100m': (100, 'abc', ['abc204', 'abc203', 'abc202', 'abc201', 'abc200', 'abc199', 'abc198',
                                  'abc197', 'abc196', 'abc195', 'abc194', 'abc193', 'abc192', 'abc191', 'abc190'])
    }
    for label, entry in dic.items():
        minutes, contest_category, contest_slugs = entry
        run(contest_slugs=contest_slugs, label=label, minutes=minutes, contest_category=contest_category)


def get_from_contest_list_page(rated_type: int = 1, category: int = 0, filename_prefix: str = 'abc') -> None:
    clprr: ContestListPageRequestResult = ContestListPageRequestResult.create_from_request(
        rated_type=rated_type, category=category)
    page: ContestListPage = clprr.contest_list_page
    contests: List[ContestListPage.Contest] = page.contests
    # print(contests)

    # duration => list of slugs
    duration2contest: Dict[int, List[str]] = {}
    for contest in contests:
        if contest.duration_minutes in duration2contest:
            duration2contest[contest.duration_minutes].append(contest.contest_slug)
        else:
            duration2contest[contest.duration_minutes] = [contest.contest_slug]
    # print(duration2contest)

    for minutes, contest_slugs in duration2contest.items():
        label: str = f'{filename_prefix}_{minutes}m'
        if len(contest_slugs) > 20:
            contest_slugs = contest_slugs[:20]
        print(f'# run {label}')
        print(f'  -> {contest_slugs}')
        run(contest_slugs=contest_slugs, label=label, minutes=minutes, contest_category=filename_prefix)


def main() -> None:
    ls: List[Tuple[int, int, str]] = [
        (1, 0, 'abc'),
        (2, 0, 'arc'),
        (3, 0, 'agc')
    ]
    for rated_type, category, filename_prefix in ls:
        get_from_contest_list_page(rated_type, category, filename_prefix)


if __name__ == '__main__':
    main()
