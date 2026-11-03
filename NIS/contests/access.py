from authorization import bans
from contests.contests_cabinet.models import Contest


def can_view_contest(viewer, contest):
    if not bans.visible_to(viewer, contest.company_username):
        return False
    return contest.status != Contest.STATUS_DRAFT or (viewer is not None and viewer.username == contest.company_username)
