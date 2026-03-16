"""
test_api_routes.py — Integration tests hitting FastAPI routes via TestClient.

Uses the `client` fixture from conftest.py which:
  - wires up a real FastAPI TestClient
  - patches settings.git_repo_path to a temporary git repo
  - sets promotion_mode=mock and debug=True

Auth tokens (alice_headers, bob_headers, rita_headers) are also from conftest.py.

Covers:
  - GET /health — public endpoint
  - GET /config — public endpoint, returns teams and templates
  - POST /auth/login — valid and invalid credentials
  - GET /auth/teams — public team list
  - GET /files — requires auth; lists files for the user's team
  - POST /files — saves a SQL file
  - GET /files/{path} — reads a file
  - DELETE /files/{path} — deletes a file
  - GET /files without auth — returns 401
  - GET /promotion/requests — requires auth
  - POST /promotion/submit — create a promotion request
  - POST /promotion/approve/{id} — approve a request
  - GET /locks — requires auth
  - POST /locks/{path} — acquire a lock
  - DELETE /locks/{path} — release a lock
  - PUT /locks/{path}/heartbeat — extend a lock
"""
import pytest


# ── /health ───────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self, client):
        """GET /health should return status 'ok' without authentication."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_no_auth_required(self, client):
        """GET /health should be accessible without any token."""
        resp = client.get("/health")
        assert resp.status_code == 200


# ── /config ───────────────────────────────────────────────────────────────

class TestConfig:
    def test_config_returns_teams(self, client):
        """GET /config should return a list of teams."""
        resp = client.get("/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "teams" in data
        assert len(data["teams"]) >= 2

    def test_config_includes_team_ids(self, client):
        """The config response should include team_a and team_b."""
        resp = client.get("/config")
        team_ids = [t["id"] for t in resp.json()["teams"]]
        assert "team_a" in team_ids
        assert "team_b" in team_ids

    def test_config_includes_sql_templates(self, client):
        """GET /config should return SQL templates."""
        resp = client.get("/config")
        data = resp.json()
        assert "sql_templates" in data
        assert len(data["sql_templates"]) > 0

    def test_config_template_has_required_fields(self, client):
        """Each SQL template must have name, description, and content."""
        resp = client.get("/config")
        for tmpl in resp.json()["sql_templates"]:
            assert "name" in tmpl
            assert "description" in tmpl
            assert "content" in tmpl

    def test_config_no_auth_required(self, client):
        """GET /config should be accessible without authentication."""
        resp = client.get("/config")
        assert resp.status_code == 200


# ── /auth/teams ───────────────────────────────────────────────────────────

class TestAuthTeams:
    def test_list_teams_no_auth(self, client):
        """GET /auth/teams should return team list without requiring auth."""
        resp = client.get("/auth/teams")
        assert resp.status_code == 200
        teams = resp.json()
        assert isinstance(teams, list)
        assert any(t["id"] == "team_a" for t in teams)

    def test_list_teams_has_name_field(self, client):
        """Each team in /auth/teams should have an 'id' and 'name'."""
        resp = client.get("/auth/teams")
        for team in resp.json():
            assert "id" in team
            assert "name" in team


# ── /auth/login ───────────────────────────────────────────────────────────

class TestAuthLogin:
    @pytest.mark.parametrize("username,expected_team", [
        ("alice", "team_a"),
        ("bob",   "team_a"),
        ("rita",  "team_b"),
    ])
    def test_valid_login_returns_token(self, client, username, expected_team):
        """Valid login should return a JWT and correct user info."""
        resp = client.post(
            "/auth/login",
            json={"username": username, "password": "password"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["team_id"] == expected_team

    def test_wrong_password_returns_401(self, client):
        """Wrong password should return 401 Unauthorized."""
        resp = client.post(
            "/auth/login",
            json={"username": "alice", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    def test_unknown_user_returns_401(self, client):
        """An unknown user should return 401 Unauthorized."""
        resp = client.post(
            "/auth/login",
            json={"username": "nobody_xyz", "password": "anypass"},
        )
        assert resp.status_code == 401

    def test_login_response_includes_expires_in(self, client):
        """Login response should include expires_in (in seconds)."""
        resp = client.post(
            "/auth/login",
            json={"username": "alice", "password": "password"},
        )
        data = resp.json()
        assert "expires_in" in data
        assert isinstance(data["expires_in"], int)
        assert data["expires_in"] > 0


# ── /files ────────────────────────────────────────────────────────────────

class TestFilesEndpoints:
    def test_list_files_requires_auth(self, client):
        """GET /files without Authorization header should return 401."""
        resp = client.get("/files")
        assert resp.status_code == 401

    def test_list_files_returns_response(self, client, alice_headers):
        """GET /files should return FileListResponse for alice's team."""
        resp = client.get("/files", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "team_id" in data
        assert "files" in data
        assert data["team_id"] == "team_a"

    def test_save_file_creates_file(self, client, alice_headers):
        """POST /files should create a SQL file and return a commit SHA."""
        resp = client.post(
            "/files",
            json={
                "filename": "test_route.sql",
                "content": "SELECT 'hello from route test';",
                "commit_message": "test commit",
            },
            headers=alice_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "commit_sha" in data
        assert "path" in data
        assert "test_route.sql" in data["path"]

    def test_save_file_requires_auth(self, client):
        """POST /files without auth should return 401."""
        resp = client.post(
            "/files",
            json={"filename": "unauth.sql", "content": "SELECT 1;"},
        )
        assert resp.status_code == 401

    def test_get_file_reads_saved_content(self, client, alice_headers):
        """GET /files/{path} should return the content of a previously saved file."""
        content = "SELECT 'read back test';"
        client.post(
            "/files",
            json={"filename": "readback.sql", "content": content},
            headers=alice_headers,
        )
        resp = client.get("/files/readback.sql", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == content

    def test_get_file_not_found_returns_404(self, client, alice_headers):
        """GET /files/{path} for a non-existent file should return 404."""
        resp = client.get("/files/does_not_exist_xyz.sql", headers=alice_headers)
        assert resp.status_code == 404

    def test_delete_file_returns_success(self, client, alice_headers):
        """DELETE /files/{path} should return 200 with a commit_sha."""
        client.post(
            "/files",
            json={"filename": "to_delete_route.sql", "content": "DELETE;"},
            headers=alice_headers,
        )
        resp = client.delete("/files/to_delete_route.sql", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "commit_sha" in data

    def test_delete_nonexistent_returns_404(self, client, alice_headers):
        """DELETE /files/{path} for a non-existent file should return 404."""
        resp = client.delete("/files/ghost_file_xyz.sql", headers=alice_headers)
        assert resp.status_code == 404

    def test_save_file_with_subfolder(self, client, alice_headers):
        """POST /files with a subfolder should create the file under the subfolder."""
        resp = client.post(
            "/files",
            json={
                "filename": "subfolder_test.sql",
                "content": "SELECT subfolder;",
                "subfolder": "tables/core",
            },
            headers=alice_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "tables/core" in data["path"]

    def test_save_invalid_filename_returns_400(self, client, alice_headers):
        """Saving a file with an invalid filename should return 400."""
        resp = client.post(
            "/files",
            json={"filename": "evil.sh", "content": "rm -rf /"},
            headers=alice_headers,
        )
        assert resp.status_code == 400

    def test_rita_cannot_see_alice_files(self, client, alice_headers, rita_headers):
        """Rita (team_b) should see different files from Alice (team_a)."""
        client.post(
            "/files",
            json={"filename": "alice_only.sql", "content": "SELECT alice;"},
            headers=alice_headers,
        )
        resp = client.get("/files/alice_only.sql", headers=rita_headers)
        assert resp.status_code == 404


# ── /promotion ────────────────────────────────────────────────────────────

class TestPromotionEndpoints:
    def test_list_requests_requires_auth(self, client):
        """GET /promotion/requests without auth should return 401."""
        resp = client.get("/promotion/requests")
        assert resp.status_code == 401

    def test_submit_promotion_creates_request(self, client, alice_headers):
        """POST /promotion/submit should create a promotion request."""
        resp = client.post(
            "/promotion/submit",
            json={
                "files": ["promo_test.sql"],
                "from_env": "dev",
                "to_env": "qa",
                "notes": "Integration test",
            },
            headers=alice_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "open"
        assert data["team_id"] == "team_a"

    def test_submit_empty_files_returns_400(self, client, alice_headers):
        """Submitting with an empty files list should return 400."""
        resp = client.post(
            "/promotion/submit",
            json={"files": [], "from_env": "dev", "to_env": "qa"},
            headers=alice_headers,
        )
        assert resp.status_code == 400

    def test_submit_invalid_from_env_returns_400(self, client, alice_headers):
        """from_env must be 'dev' or 'qa'; invalid value should return 400."""
        resp = client.post(
            "/promotion/submit",
            json={"files": ["x.sql"], "from_env": "staging", "to_env": "qa"},
            headers=alice_headers,
        )
        assert resp.status_code == 400

    def test_list_requests_returns_submitted(self, client, alice_headers):
        """After submitting, GET /promotion/requests should include the new request."""
        submit_resp = client.post(
            "/promotion/submit",
            json={"files": ["visible.sql"], "from_env": "dev", "to_env": "qa"},
            headers=alice_headers,
        )
        req_id = submit_resp.json()["id"]

        list_resp = client.get("/promotion/requests", headers=alice_headers)
        ids = [r["id"] for r in list_resp.json()]
        assert req_id in ids

    def test_approve_own_submission_returns_403(self, client, alice_headers):
        """Alice cannot approve her own submission (self-review blocked)."""
        submit_resp = client.post(
            "/promotion/submit",
            json={"files": ["self_approve.sql"], "from_env": "dev", "to_env": "qa"},
            headers=alice_headers,
        )
        req_id = submit_resp.json()["id"]
        resp = client.post(f"/promotion/approve/{req_id}", headers=alice_headers)
        assert resp.status_code == 403

    def test_approve_by_another_team_member_succeeds(self, client, alice_headers, bob_headers):
        """Bob (same team) can approve Alice's submission."""
        submit_resp = client.post(
            "/promotion/submit",
            json={"files": ["approvable.sql"], "from_env": "dev", "to_env": "qa"},
            headers=alice_headers,
        )
        req_id = submit_resp.json()["id"]
        resp = client.post(f"/promotion/approve/{req_id}", headers=bob_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_get_summary_returns_counts(self, client, alice_headers):
        """GET /promotion/summary should return pending/deployed counts."""
        resp = client.get("/promotion/summary", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "pending_qa" in data
        assert "pending_prod" in data
        assert "qa_deployed_count" in data
        assert "prod_deployed_count" in data


# ── /locks ────────────────────────────────────────────────────────────────

class TestLockEndpoints:
    def test_list_locks_requires_auth(self, client):
        """GET /locks without auth should return 401."""
        resp = client.get("/locks")
        assert resp.status_code == 401

    def test_list_locks_returns_list(self, client, alice_headers):
        """GET /locks should return a list (possibly empty)."""
        resp = client.get("/locks", headers=alice_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_acquire_lock_succeeds(self, client, alice_headers):
        """POST /locks/{path} should acquire the lock and return lock info."""
        resp = client.post("/locks/lock_test_route.sql", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "alice"
        assert data["file_path"] == "lock_test_route.sql"

        # Cleanup
        client.delete("/locks/lock_test_route.sql", headers=alice_headers)

    def test_acquire_lock_conflict_returns_409(self, client, alice_headers, bob_headers):
        """A second user trying to acquire the same lock should get 409 Conflict."""
        client.post("/locks/conflict_test.sql", headers=alice_headers)
        resp = client.post("/locks/conflict_test.sql", headers=bob_headers)
        assert resp.status_code == 409

        # Cleanup
        client.delete("/locks/conflict_test.sql", headers=alice_headers)

    def test_release_lock_returns_success(self, client, alice_headers):
        """DELETE /locks/{path} should release the lock."""
        client.post("/locks/release_test.sql", headers=alice_headers)
        resp = client.delete("/locks/release_test.sql", headers=alice_headers)
        assert resp.status_code == 200
        assert resp.json()["released"] is True

    def test_heartbeat_extends_lock(self, client, alice_headers):
        """PUT /locks/{path}/heartbeat should return an updated lock."""
        client.post("/locks/heartbeat_test.sql", headers=alice_headers)
        resp = client.put("/locks/heartbeat_test.sql/heartbeat", headers=alice_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "expires_at" in data

        # Cleanup
        client.delete("/locks/heartbeat_test.sql", headers=alice_headers)

    def test_heartbeat_without_lock_returns_404(self, client, alice_headers):
        """Heartbeat on a non-existent lock should return 404."""
        resp = client.put("/locks/no_such_lock.sql/heartbeat", headers=alice_headers)
        assert resp.status_code == 404
