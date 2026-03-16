"""
test_files.py — Unit tests for git_service (file CRUD backed by a temp git repo).

All tests use a fresh temporary git repo via the `tmp_repo` fixture so the
real repository is never touched.

Covers:
  - save_file: write a new SQL file and get back a commit SHA
  - save_file: write to a subfolder
  - save_file: overwrite an existing file
  - save_file: invalid filename raises ValueError
  - read_file: read back content written by save_file
  - read_file: non-existent file raises FileNotFoundError
  - list_files: returns correct SqlFile entries
  - list_files: empty folder returns empty list
  - delete_file: removes a file and returns commit SHA
  - delete_file: non-existent file raises FileNotFoundError
  - _validate_filename: safe / unsafe filenames
"""
import pytest
from pathlib import Path

import git_service
from git_service import _validate_filename


TEAM_FOLDER = "team-a"
AUTHOR = "Test User"
EMAIL = "test@example.com"


# ── _validate_filename ─────────────────────────────────────────────────────

class TestValidateFilename:
    @pytest.mark.parametrize("name", [
        "users.sql",
        "create_orders.sql",
        "my-table.sql",
        "table 1.sql",
        "ABC_123.sql",
    ])
    def test_valid_filenames(self, name):
        """Valid filenames should pass validation and be returned unchanged."""
        result = _validate_filename(name)
        assert result == name

    @pytest.mark.parametrize("bad_name", [
        "../../etc/passwd",
        "script.sh",
        "file.sql.sh",
        "",
        "no_extension",
        "file;drop.sql",
        "file<script>.sql",
    ])
    def test_invalid_filenames_raise(self, bad_name):
        """Invalid filenames should raise ValueError."""
        with pytest.raises(ValueError):
            _validate_filename(bad_name)


# ── save_file ─────────────────────────────────────────────────────────────

class TestSaveFile:
    def test_save_creates_file(self, tmp_repo):
        """save_file should write the SQL content to disk in the team folder."""
        sha = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="users.sql",
            content="SELECT 1;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        expected = tmp_repo / TEAM_FOLDER / "users.sql"
        assert expected.exists()
        assert expected.read_text() == "SELECT 1;"

    def test_save_returns_commit_sha(self, tmp_repo):
        """save_file should return a non-empty commit SHA string."""
        sha = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="orders.sql",
            content="SELECT 2;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        assert isinstance(sha, str)
        assert len(sha) > 0

    def test_save_to_subfolder(self, tmp_repo):
        """save_file with a subfolder should create the file in the nested directory."""
        sha = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="products.sql",
            content="SELECT 3;",
            author_name=AUTHOR,
            author_email=EMAIL,
            subfolder="tables/core",
        )
        expected = tmp_repo / TEAM_FOLDER / "tables" / "core" / "products.sql"
        assert expected.exists()
        assert expected.read_text() == "SELECT 3;"

    def test_save_overwrites_existing_file(self, tmp_repo):
        """Saving a file twice should overwrite content and return a new SHA."""
        sha1 = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="update_me.sql",
            content="SELECT 'v1';",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        sha2 = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="update_me.sql",
            content="SELECT 'v2';",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        file_path = tmp_repo / TEAM_FOLDER / "update_me.sql"
        assert file_path.read_text() == "SELECT 'v2';"
        assert sha1 != sha2

    def test_save_with_custom_commit_message(self, tmp_repo):
        """A custom commit message should be used when provided."""
        import git
        sha = git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="msg_test.sql",
            content="SELECT 4;",
            author_name=AUTHOR,
            author_email=EMAIL,
            commit_message="my custom message",
        )
        repo = git.Repo(str(tmp_repo))
        last_commit = list(repo.iter_commits(max_count=1))[0]
        assert "my custom message" in last_commit.message

    def test_save_invalid_filename_raises(self, tmp_repo):
        """Saving with an invalid filename should raise ValueError."""
        with pytest.raises(ValueError):
            git_service.save_file(
                team_folder=TEAM_FOLDER,
                filename="hack.sh",
                content="rm -rf /",
                author_name=AUTHOR,
                author_email=EMAIL,
            )


# ── read_file ─────────────────────────────────────────────────────────────

class TestReadFile:
    def test_read_returns_content(self, tmp_repo):
        """read_file should return exactly the content that was saved."""
        content = "SELECT id, name FROM users;"
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="readable.sql",
            content=content,
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        result = git_service.read_file(TEAM_FOLDER, "readable.sql")
        assert result == content

    def test_read_from_subfolder(self, tmp_repo):
        """read_file should handle paths with subfolders."""
        content = "SELECT * FROM orders;"
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="orders.sql",
            content=content,
            author_name=AUTHOR,
            author_email=EMAIL,
            subfolder="views",
        )
        result = git_service.read_file(TEAM_FOLDER, "views/orders.sql")
        assert result == content

    def test_read_nonexistent_file_raises(self, tmp_repo):
        """Reading a file that does not exist should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            git_service.read_file(TEAM_FOLDER, "does_not_exist.sql")

    def test_read_path_traversal_raises(self, tmp_repo):
        """Attempting a path traversal should raise ValueError."""
        with pytest.raises(ValueError):
            git_service.read_file(TEAM_FOLDER, "../../etc/passwd.sql")


# ── list_files ────────────────────────────────────────────────────────────

class TestListFiles:
    def test_list_returns_sql_file_objects(self, tmp_repo):
        """list_files should return SqlFile objects for all .sql files in the folder."""
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="list_test.sql",
            content="SELECT 1;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        files = git_service.list_files(TEAM_FOLDER)
        names = [f.name for f in files]
        assert "list_test.sql" in names

    def test_list_empty_folder_returns_empty(self, tmp_repo):
        """list_files on a folder with no .sql files should return an empty list."""
        files = git_service.list_files("empty-team")
        assert files == []

    def test_list_includes_subfolder_files(self, tmp_repo):
        """list_files should recursively find .sql files in subfolders."""
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="deep.sql",
            content="SELECT deep;",
            author_name=AUTHOR,
            author_email=EMAIL,
            subfolder="tables/staging",
        )
        files = git_service.list_files(TEAM_FOLDER)
        names = [f.name for f in files]
        assert "deep.sql" in names

    def test_list_file_has_correct_path(self, tmp_repo):
        """Each SqlFile should have a path relative to the team folder."""
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="path_check.sql",
            content="SELECT path;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        files = git_service.list_files(TEAM_FOLDER)
        match = next((f for f in files if f.name == "path_check.sql"), None)
        assert match is not None
        assert match.path == "path_check.sql"

    def test_list_subfolder_file_has_subfolder_attribute(self, tmp_repo):
        """SqlFile for a nested file should have the subfolder attribute set."""
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="nested.sql",
            content="SELECT nested;",
            author_name=AUTHOR,
            author_email=EMAIL,
            subfolder="procedures",
        )
        files = git_service.list_files(TEAM_FOLDER)
        match = next((f for f in files if f.name == "nested.sql"), None)
        assert match is not None
        assert match.subfolder == "procedures"

    def test_list_file_size_bytes(self, tmp_repo):
        """size_bytes should match the actual file size."""
        content = "SELECT 42;"
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="size_test.sql",
            content=content,
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        files = git_service.list_files(TEAM_FOLDER)
        match = next((f for f in files if f.name == "size_test.sql"), None)
        assert match is not None
        assert match.size_bytes == len(content.encode("utf-8"))


# ── delete_file ───────────────────────────────────────────────────────────

class TestDeleteFile:
    def test_delete_returns_sha(self, tmp_repo):
        """delete_file should return a non-empty commit SHA."""
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="del_sha.sql",
            content="SELECT del;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        sha = git_service.delete_file(
            team_folder=TEAM_FOLDER,
            rel_path="del_sha.sql",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        assert isinstance(sha, str)
        assert len(sha) > 0

    def test_delete_creates_git_commit(self, tmp_repo):
        """delete_file should create a git commit recording the deletion."""
        import git as gitlib
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="commit_del.sql",
            content="SELECT del;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        git_service.delete_file(
            team_folder=TEAM_FOLDER,
            rel_path="commit_del.sql",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        repo = gitlib.Repo(str(tmp_repo))
        last_commit = list(repo.iter_commits(max_count=1))[0]
        assert "delete" in last_commit.message.lower() or "commit_del" in last_commit.message

    def test_delete_nonexistent_raises(self, tmp_repo):
        """Deleting a file that does not exist should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            git_service.delete_file(
                team_folder=TEAM_FOLDER,
                rel_path="ghost.sql",
                author_name=AUTHOR,
                author_email=EMAIL,
            )

    def test_delete_file_removed_from_git_index(self, tmp_repo):
        """
        After deletion, the file should be removed from the git index
        (i.e., not tracked in the latest tree).
        Note: GitPython's index.remove() removes from index but may leave
        the physical file; we verify git tracking rather than physical presence.
        """
        import git as gitlib
        git_service.save_file(
            team_folder=TEAM_FOLDER,
            filename="git_del.sql",
            content="SELECT git_del;",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        git_service.delete_file(
            team_folder=TEAM_FOLDER,
            rel_path="git_del.sql",
            author_name=AUTHOR,
            author_email=EMAIL,
        )
        repo = gitlib.Repo(str(tmp_repo))
        # The file should not be tracked in the HEAD tree
        tree_files = [item.path for item in repo.head.commit.tree.traverse()]
        expected_tracked_path = f"{TEAM_FOLDER}/git_del.sql"
        assert expected_tracked_path not in tree_files
