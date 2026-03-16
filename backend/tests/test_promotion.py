"""
test_promotion.py — Unit tests for promotion_service.

Tests the in-memory promotion store directly (no HTTP layer).
`_save()` is patched to avoid hitting the real git repo.
`settings.promotion_mode` is set to "mock" for all tests.

Covers:
  - submit_promotion: creates a request with status 'open'
  - submit_promotion: schedules a cron-based promotion
  - get_requests: returns submitted requests for a team
  - get_requests: does NOT return other teams' requests
  - approve_promotion: changes status to 'approved'
  - approve_promotion: non-existent request_id returns None
  - mark_deployed: changes status to 'deployed'
  - mark_deployed: only works when status is 'approved'
  - get_summary: correct pending counts
  - clear_requests: empties the store for a team
  - mock auto-approve: request is auto-approved after delay expires
"""
import pytest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta

import promotion_service
from promotion_service import (
    submit_promotion,
    get_requests,
    approve_promotion,
    mark_deployed,
    get_summary,
    clear_requests,
)
from models import PromotionStatus
from config import settings


TEAM_A = "team_a"
TEAM_B = "team_b"


@pytest.fixture(autouse=True)
def reset_store():
    """Reset the in-memory store and patch _save() before each test."""
    promotion_service._store = {}
    with patch("promotion_service._save"):
        yield
    promotion_service._store = {}


@pytest.fixture(autouse=True)
def set_mock_mode(monkeypatch):
    """Ensure promotion_mode is 'mock' for all tests."""
    monkeypatch.setattr(settings, "promotion_mode", "mock")
    monkeypatch.setattr(settings, "mock_approval_delay_s", 30)


# ── submit_promotion ──────────────────────────────────────────────────────

class TestSubmitPromotion:
    def test_submit_creates_open_request(self):
        """submit_promotion should create a request with status 'open'."""
        req = submit_promotion(
            team_id=TEAM_A,
            from_env="dev",
            to_env="qa",
            files=["users.sql"],
            submitted_by="Alice Chen",
        )
        assert req.status == PromotionStatus.open
        assert req.team_id == TEAM_A
        assert req.from_env == "dev"
        assert req.to_env == "qa"
        assert req.files == ["users.sql"]
        assert req.submitted_by == "Alice Chen"

    def test_submit_generates_unique_ids(self):
        """Each submission should have a unique UUID."""
        r1 = submit_promotion(TEAM_A, "dev", "qa", ["a.sql"], "Alice Chen")
        r2 = submit_promotion(TEAM_A, "dev", "qa", ["b.sql"], "Alice Chen")
        assert r1.id != r2.id

    def test_submit_with_notes(self):
        """Notes should be stored on the request."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["x.sql"], "Alice Chen", notes="Hotfix")
        assert req.notes == "Hotfix"

    def test_submit_with_schedule(self):
        """A cron schedule should be stored on the request."""
        req = submit_promotion(
            team_id=TEAM_A,
            from_env="dev",
            to_env="qa",
            files=["sched.sql"],
            submitted_by="Alice Chen",
            schedule="0 6 * * *",
        )
        assert req.schedule == "0 6 * * *"

    def test_submit_multiple_files(self):
        """Multiple files can be submitted in one request."""
        files = ["a.sql", "b.sql", "c.sql"]
        req = submit_promotion(TEAM_A, "dev", "qa", files, "Alice Chen")
        assert len(req.files) == 3

    def test_submit_is_stored_in_team_bucket(self):
        """Submitted request should appear in get_requests for the same team."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["stored.sql"], "Alice Chen")
        requests = get_requests(TEAM_A)
        ids = [r.id for r in requests]
        assert req.id in ids


# ── get_requests ──────────────────────────────────────────────────────────

class TestGetRequests:
    def test_get_returns_only_own_team_requests(self):
        """Requests for team_a should not appear when querying team_b."""
        submit_promotion(TEAM_A, "dev", "qa", ["a.sql"], "Alice Chen")
        submit_promotion(TEAM_B, "dev", "qa", ["b.sql"], "Rita Patel")

        team_a_requests = get_requests(TEAM_A)
        team_b_requests = get_requests(TEAM_B)

        assert all(r.team_id == TEAM_A for r in team_a_requests)
        assert all(r.team_id == TEAM_B for r in team_b_requests)

    def test_get_empty_for_new_team(self):
        """A team with no submissions should return an empty list."""
        result = get_requests("no_such_team")
        assert result == []

    def test_get_returns_list_of_promotion_requests(self):
        """get_requests should return PromotionRequest objects."""
        submit_promotion(TEAM_A, "dev", "qa", ["r.sql"], "Alice Chen")
        requests = get_requests(TEAM_A)
        from models import PromotionRequest
        assert all(isinstance(r, PromotionRequest) for r in requests)


# ── approve_promotion ─────────────────────────────────────────────────────

class TestApprovePromotion:
    def test_approve_changes_status_to_approved(self):
        """approve_promotion should update the request status to 'approved'."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["approve_me.sql"], "Alice Chen")
        approved = approve_promotion(TEAM_A, req.id, "Bob Smith")
        assert approved is not None
        assert approved.status == PromotionStatus.approved
        assert approved.reviewed_by == "Bob Smith"
        assert approved.reviewed_at is not None

    def test_approve_nonexistent_returns_none(self):
        """approve_promotion with a non-existent ID should return None."""
        result = approve_promotion(TEAM_A, "nonexistent-id-000", "Bob Smith")
        assert result is None

    def test_approve_already_approved_returns_none(self):
        """Approving an already-approved request should return None (not in 'open' state)."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["double.sql"], "Alice Chen")
        approve_promotion(TEAM_A, req.id, "Bob Smith")
        result = approve_promotion(TEAM_A, req.id, "Bob Smith")
        assert result is None

    def test_approve_sets_reviewed_by(self):
        """reviewed_by should be set to the reviewer's name."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["rev.sql"], "Alice Chen")
        approved = approve_promotion(TEAM_A, req.id, "Bob Smith")
        assert approved.reviewed_by == "Bob Smith"


# ── mark_deployed ─────────────────────────────────────────────────────────

class TestMarkDeployed:
    def test_mark_deployed_changes_status(self):
        """mark_deployed should change status from 'approved' to 'deployed'."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["deploy_me.sql"], "Alice Chen")
        approve_promotion(TEAM_A, req.id, "Bob Smith")
        deployed = mark_deployed(TEAM_A, req.id)
        assert deployed is not None
        assert deployed.status == PromotionStatus.deployed
        assert deployed.deployed_at is not None

    def test_mark_deployed_on_open_returns_none(self):
        """mark_deployed on an 'open' (not yet approved) request should return None."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["not_ready.sql"], "Alice Chen")
        result = mark_deployed(TEAM_A, req.id)
        assert result is None

    def test_mark_deployed_nonexistent_returns_none(self):
        """mark_deployed with a non-existent ID should return None."""
        result = mark_deployed(TEAM_A, "ghost-id-999")
        assert result is None


# ── get_summary ───────────────────────────────────────────────────────────

class TestGetSummary:
    def test_summary_counts_pending_qa(self):
        """Pending QA promotions should be counted in pending_qa."""
        submit_promotion(TEAM_A, "dev", "qa", ["qa1.sql"], "Alice Chen")
        submit_promotion(TEAM_A, "dev", "qa", ["qa2.sql"], "Alice Chen")
        summary = get_summary(TEAM_A)
        assert len(summary.pending_qa) == 2

    def test_summary_counts_pending_prod(self):
        """Pending prod promotions should appear in pending_prod."""
        submit_promotion(TEAM_A, "qa", "prod", ["prod1.sql"], "Alice Chen")
        summary = get_summary(TEAM_A)
        assert len(summary.pending_prod) == 1

    def test_summary_deployed_count(self):
        """Deployed files should be counted in qa_deployed_count."""
        req = submit_promotion(TEAM_A, "dev", "qa", ["counted.sql"], "Alice Chen")
        approve_promotion(TEAM_A, req.id, "Bob Smith")
        mark_deployed(TEAM_A, req.id)
        summary = get_summary(TEAM_A)
        assert summary.qa_deployed_count == 1
        assert len(summary.pending_qa) == 0

    def test_summary_empty_team(self):
        """An empty team should have zero counts and empty pending lists."""
        summary = get_summary("empty_team")
        assert summary.qa_deployed_count == 0
        assert summary.prod_deployed_count == 0
        assert summary.pending_qa == []
        assert summary.pending_prod == []


# ── clear_requests ────────────────────────────────────────────────────────

class TestClearRequests:
    def test_clear_empties_team_store(self):
        """clear_requests should remove all requests for the specified team."""
        submit_promotion(TEAM_A, "dev", "qa", ["gone.sql"], "Alice Chen")
        assert len(get_requests(TEAM_A)) == 1
        clear_requests(TEAM_A)
        assert get_requests(TEAM_A) == []

    def test_clear_does_not_affect_other_teams(self):
        """Clearing team_a requests should not affect team_b requests."""
        submit_promotion(TEAM_A, "dev", "qa", ["a.sql"], "Alice Chen")
        submit_promotion(TEAM_B, "dev", "qa", ["b.sql"], "Rita Patel")
        clear_requests(TEAM_A)
        assert get_requests(TEAM_A) == []
        assert len(get_requests(TEAM_B)) == 1


# ── Mock auto-approve ─────────────────────────────────────────────────────

class TestMockAutoApprove:
    def test_auto_approve_after_delay(self, monkeypatch):
        """
        When the mock approval delay has elapsed, get_requests should
        automatically set the status to 'approved'.
        """
        # Set a very short delay (0 seconds = immediate)
        monkeypatch.setattr(settings, "mock_approval_delay_s", 0)

        req = submit_promotion(TEAM_A, "dev", "qa", ["auto.sql"], "Alice Chen")
        # Override the submitted_at to be in the past
        raw = promotion_service._store[TEAM_A][0]
        raw["submitted_at"] = (
            datetime.now(timezone.utc) - timedelta(seconds=60)
        ).isoformat()

        requests = get_requests(TEAM_A)
        assert requests[0].status == PromotionStatus.approved
