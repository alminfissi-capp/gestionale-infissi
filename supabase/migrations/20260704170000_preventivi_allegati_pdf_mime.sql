-- Il bucket `preventivi-allegati` nasceva per le sole immagini
-- (allowed_mime_types = immagini, file_size_limit = 5 MB).
-- La feature "Allega PDF dal dispositivo" carica PDF in questo bucket:
-- senza application/pdf tra i mime consentiti, l'upload falliva con HTTP 400.
-- Consentiamo application/pdf e allineiamo il limite a 10 MB (come il controllo UI).

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf'],
    file_size_limit = 10485760
where id = 'preventivi-allegati';
