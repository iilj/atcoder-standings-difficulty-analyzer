from typing import List, Match, Optional, Pattern
from bs4 import BeautifulSoup
from bs4.element import Tag
import re
from datetime import datetime

from typing_extensions import Literal

SubmissionStatus = Literal['AC', 'WA', 'IE', 'OLE', 'RE', 'TLE', 'MLE', 'CE', 'WJ', 'WR']


class ContestListPage:
    """コンテスト一覧ページの1つを表すクラス．コンストラクタ内で HTML をパースする．
    """
    class Contest:
        """コンテストインスタンス
        """
        time: datetime
        time_unix: int
        contest_slug: str
        contest_name: str
        duration_minutes: int

        contest_href_pattern: Pattern[str] = re.compile(r'/contests/([^/]+)')
        duration_pattern: Pattern[str] = re.compile(r'(\d+):(\d+)')

        def __init__(self, table_row: Tag) -> None:
            """コンテスト一覧ページ内のテーブルのある行タグから，コンテストインスタンスを初期化する．

            Args:
                table_row (Tag): 行タグ
            """
            table_data_list: List[Tag] = table_row.select('td')

            time_str: str = table_data_list[0].get_text()
            self.time = datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S+0900')
            self.time_unix = int(self.time.timestamp())

            contest_tag: Tag = table_data_list[1].find('a')
            contest_href_match: Optional[Match[str]] = self.contest_href_pattern.search(contest_tag['href'])
            assert contest_href_match is not None
            self.contest_slug = contest_href_match.group(1)
            self.contest_name = contest_tag.get_text()

            duration_str: str = table_data_list[2].get_text()
            duration_match: Optional[Match[str]] = self.duration_pattern.search(duration_str)
            assert duration_match is not None
            hours: int = int(duration_match.group(1))
            minutes: int = int(duration_match.group(2))
            self.duration_minutes = hours * 60 + minutes

        def __repr__(self) -> str:
            return ('<Contest '
                    f'time={self.time}, slug={self.contest_slug}, name={self.contest_name}, duration={self.duration_minutes}>')

    contests: List[Contest]

    def __init__(self, html: str) -> None:
        """HTML をパースしてコンテスト一覧を初期化する．

        Args:
            html (str): コンテスト一覧ページの HTML 文字列．
        """
        # get submissions
        soup: BeautifulSoup = BeautifulSoup(html, "html.parser")
        table_rows: List[Tag] = soup.select('div.table-responsive table.table tbody tr')
        self.contests = [ContestListPage.Contest(table_row) for table_row in table_rows]

    def __repr__(self) -> str:
        return (f'<ContestListPage contests={self.contests}>')
