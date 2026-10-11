BEGIN;

-- Running upgrade 10b810a4f008 -> 11b810a4f009

CREATE TABLE player_context_datasets (
    id VARCHAR(36) NOT NULL, 
    acquisition_id VARCHAR(36) NOT NULL, 
    source_name VARCHAR(50) NOT NULL, 
    kind VARCHAR(30) NOT NULL, 
    season VARCHAR(10) NOT NULL, 
    content_sha256 VARCHAR(64) NOT NULL, 
    membership_sha256 VARCHAR(64) NOT NULL, 
    parser_version VARCHAR(40) NOT NULL, 
    observation_order INTEGER NOT NULL, 
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    admission_transaction VARCHAR(32) NOT NULL, 
    coverage_json JSON NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(acquisition_id) REFERENCES workbench_acquisitions (id), 
    UNIQUE (acquisition_id), 
    UNIQUE (id, source_name, kind, season), 
    UNIQUE (observation_order)
);

CREATE INDEX ix_player_context_scope ON player_context_datasets (season, kind, observed_at);

CREATE TABLE player_context_versions (
    id VARCHAR(36) NOT NULL, 
    source_name VARCHAR(50) NOT NULL, 
    kind VARCHAR(30) NOT NULL, 
    season VARCHAR(10) NOT NULL, 
    entity_key VARCHAR(200) NOT NULL, 
    content_sha256 VARCHAR(64) NOT NULL, 
    payload_json JSON NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (id, entity_key, source_name, kind, season), 
    UNIQUE (source_name, kind, season, entity_key, content_sha256)
);

CREATE TABLE player_context_members (
    dataset_id VARCHAR(36) NOT NULL, 
    entity_key VARCHAR(200) NOT NULL, 
    source_name VARCHAR(50) NOT NULL, 
    kind VARCHAR(30) NOT NULL, 
    season VARCHAR(10) NOT NULL, 
    version_id VARCHAR(36) NOT NULL, 
    row_locator VARCHAR(100) NOT NULL, 
    PRIMARY KEY (dataset_id, entity_key), 
    FOREIGN KEY(version_id, entity_key, source_name, kind, season) REFERENCES player_context_versions (id, entity_key, source_name, kind, season), 
    FOREIGN KEY(dataset_id, source_name, kind, season) REFERENCES player_context_datasets (id, source_name, kind, season)
);

CREATE OR REPLACE FUNCTION seal_player_context()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'player context is append-only'; END; $$;

CREATE TRIGGER seal_player_context_datasets BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_datasets FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context();

CREATE TRIGGER seal_player_context_versions BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_versions FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context();

CREATE TRIGGER seal_player_context_members BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_members FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context();

CREATE OR REPLACE FUNCTION seal_player_context_member()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM player_context_datasets WHERE id=NEW.dataset_id
    AND admission_transaction=txid_current()::text) THEN
    RAISE EXCEPTION 'player context membership is sealed'; END IF;
    RETURN NEW; END; $$;

CREATE TRIGGER seal_player_context_insert BEFORE INSERT ON player_context_members FOR EACH ROW EXECUTE FUNCTION seal_player_context_member();

CREATE OR REPLACE FUNCTION seal_player_context_source()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM player_context_datasets WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'player context provenance is append-only';
    END IF;
    IF TG_TABLE_NAME='workbench_artifacts' AND EXISTS (
      SELECT 1 FROM player_context_datasets d JOIN workbench_acquisitions a
      ON a.id=d.acquisition_id WHERE a.artifact_id=OLD.id) THEN
      RAISE EXCEPTION 'player context provenance is append-only';
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$;

CREATE TRIGGER seal_player_context_source BEFORE UPDATE OR DELETE ON workbench_acquisitions FOR EACH ROW EXECUTE FUNCTION seal_player_context_source();

CREATE TRIGGER seal_player_context_source BEFORE UPDATE OR DELETE ON workbench_artifacts FOR EACH ROW EXECUTE FUNCTION seal_player_context_source();

UPDATE alembic_version SET version_num='11b810a4f009' WHERE alembic_version.version_num = '10b810a4f008';

COMMIT;

