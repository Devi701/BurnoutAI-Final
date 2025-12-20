#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Building Frontend ---"
cd frontend
npm install
npm run build
cd ..

echo "--- Installing Backend ---"
cd backend
npm install

echo "--- Build Complete ---"