#!/usr/bin/env bash
set -e

export FLASK_APP=wsgi.py

python wsgi.py
