# Backup & Restore Guide

Because browser IndexedDB storage is tied to your local browser profile, clearing site data or switching devices removes local records unless you maintain regular backups.

## Exporting Backups
1. Open **Settings -> Backup & Restore** (or **Import & Export**).
2. Download a **Plain JSON Backup** (`solodesk-backup-YYYY-MM-DD.json`) or provide a strong passphrase to download an **AES-256-GCM Encrypted Backup**.
3. Backups contain a schema version (`solodesk-ai-backup-v1`), export timestamp, and record counts across all IndexedDB tables—never API keys.

## Restoring Safely
1. Upload a `.json` backup file (enter passphrase if encrypted).
2. Review the pre-import inspection summary (table counts and any ID conflicts with current data).
3. Choose **Replace Workspace** or **Merge with Existing** and confirm explicitly.
4. Before applying changes, SOLODESK AI saves a local pre-restore safety snapshot inside `Backup & Restore` and executes the restore inside an atomic Dexie transaction.
