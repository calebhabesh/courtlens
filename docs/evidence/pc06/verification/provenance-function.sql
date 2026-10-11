CREATE OR REPLACE FUNCTION seal_finance_refresh_provenance() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM finance_refresh_sources WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;
    IF TG_TABLE_NAME='workbench_artifacts' THEN
      IF EXISTS (SELECT 1 FROM finance_refresh_sources s JOIN workbench_acquisitions a
        ON a.id=s.acquisition_id WHERE a.artifact_id=OLD.id
          OR a.metadata_json->>'robots_sha256'=OLD.sha256) THEN
        RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$;
