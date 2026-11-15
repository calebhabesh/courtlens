"""cohorts.py [since-iso]: stats_cohort_entries in total, and per minute since a time."""

import sys

from sqlalchemy import create_engine, text

from courtlens.config import get_settings

TOTAL = "select count(*), max(created_at) from stats_cohort_entries"
SINCE = (
    "select date_trunc('minute', created_at) m, count(*) from stats_cohort_entries "
    "where created_at >= :t group by 1 order by 1"
)

engine = create_engine(get_settings().database_url)
with engine.connect() as connection:
    print("total", connection.execute(text(TOTAL)).one())
    if len(sys.argv) > 1:
        for row in connection.execute(text(SINCE), {"t": sys.argv[1]}):
            print(row)
