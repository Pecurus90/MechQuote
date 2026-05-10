"""Esclude tutti i file di questa directory dalla collection di pytest.

Gli script qui dentro sono test standalone eseguibili come subprocess da
`tests/integration/test_suites.py` — non sono file di test pytest.
"""

collect_ignore_glob = ["*.py"]
