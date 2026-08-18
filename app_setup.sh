#!/usr/bin/env bash
set -e

pip install -r requirements.txt

export FLASK_APP=wsgi.py

# Applies the migrations already committed under migrations/.
flask db upgrade
