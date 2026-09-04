import unittest

from src.contract import canonical_git_url, valid_opaque_id, valid_ref


class ContractTests(unittest.TestCase):
    def test_canonicalizes_supported_public_repo(self):
        self.assertEqual(canonical_git_url("https://github.com/GNOME/libxml2"),
                         "https://github.com/GNOME/libxml2.git")

    def test_rejects_credentials_and_unsupported_hosts(self):
        for value in ("https://user:pass@github.com/a/b", "https://evil.example/a/b", "git@github.com:a/b"):
            with self.assertRaises(ValueError):
                canonical_git_url(value)

    def test_rejects_unsafe_ref(self):
        with self.assertRaises(ValueError):
            valid_ref("../../etc/passwd")

    def test_ids_are_opaque_and_prefix_bound(self):
        self.assertTrue(valid_opaque_id("b_12345678", "b"))
        self.assertFalse(valid_opaque_id("github-owner-repo", "b"))
        self.assertFalse(valid_opaque_id("j_12345678", "b"))


if __name__ == "__main__":
    unittest.main()
