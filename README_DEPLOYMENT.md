# Shelf Inspection System Deployment Guide

This guide provides step-by-step instructions for deploying the updated Shelf Inspection System with the new database schema.

## Database Schema Changes

Two new tables have been created to replace the existing ones:

1. `wms_inspections` - Stores inspection metadata (replaces `wms_ispezione`)
2. `wms_inspection_responses` - Stores inspection question responses (replaces `wms_ispezione_domande`)

## Deployment Steps

### 1. Database Migration

1. Create the new database tables:
   - Deploy the SQL schema script that creates `wms_inspections` and `wms_inspection_responses` tables.

2. Run the migration script to transfer data from the old tables to the new ones:
   ```bash
   python backend/migrate_to_new_schema.py
   ```

   This script will:
   - Transfer all inspection records from `wms_ispezione` to `wms_inspections`
   - Transfer all question responses from `wms_ispezione_domande` to `wms_inspection_responses`
   - Set the `is_current` flag appropriately for each shelf's latest inspection

### 2. Deploy Backend Changes

1. Update the backend code by deploying the modified `backend.py` file that includes:
   - New API endpoints to support the updated database schema
   - Improved error handling and transaction management
   - Backward compatibility for existing frontend API calls

### 3. Deploy Frontend Changes

1. Deploy the updated `IspezioneScaffali.jsx` file that includes:
   - Support for the updated API response format
   - Improved handling of inspection status and question responses
   - Enhanced error handling and user feedback

### 4. Verify Deployment

After deployment, verify the system by:

1. Loading the warehouse map to confirm all shelf status colors display correctly
2. Completing a new inspection for a shelf to ensure data is saved correctly
3. Viewing inspection history for a shelf to confirm historical data was migrated successfully

## Rollback Plan

If issues are encountered:

1. Restore the previous backend code
2. Restore the previous frontend code
3. Keep both old and new tables until the system is confirmed working correctly

## Data Migration Considerations

The migration script handles the following:

- Maintaining inspection history for each shelf
- Setting only the most recent non-archived inspection as current
- Preserving all question responses and linking them to the correct inspection

Note: The old tables (`wms_ispezione` and `wms_ispezione_domande`) are not dropped by the migration script. They can be kept for reference until the new system is confirmed working correctly. 