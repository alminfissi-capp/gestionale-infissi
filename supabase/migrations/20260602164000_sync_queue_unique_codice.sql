-- Aggiunge constraint univoco (organization_id, codice) su catalogo_sync_queue
-- necessario per l'upsert con ignoreDuplicates quando si accoda su un lock attivo altrui.
ALTER TABLE catalogo_sync_queue
  ADD CONSTRAINT uq_sync_queue_org_codice UNIQUE (organization_id, codice);
