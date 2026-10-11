# BaseArt — notes de reprise (état au 11/10/2026)

## Projet source

- **GitHub** : `liskode/mariesallantin` (public), branche `main`, 169 commits. Branche `supabase-migration` déjà fusionnée.
- **Site** : GitHub Pages en mode « legacy » (branche `main`, racine), domaine `mariesallantin.art` (fichier `CNAME`), certificat HTTPS valide jusqu'au 03/12/2026, HTTPS non forcé.
- **Supabase** : projet `BaseArtMS` (ref `leezsypadtvypdgqgvtk`, eu-central-1, organisation « MarieSallantin »).
- Un projet Supabase **`BaseArt`** existe déjà (ref `beravkqbdvpwppupsgxc`, eu-west-3, créé le 26/09/2026), actuellement **en pause** (INACTIVE).

## Architecture

- Site **100 % statique** (HTML/CSS/JS sans framework ni build), servi par GitHub Pages.
- **Images dans git** : `media/catalogue/` contient environ 916 fichiers (3,0 Go) et `_thumbs/*.webp` (14 Mo). Le dossier `.git` pèse 4,8 Go.
  - Attention : GitHub Pages limite un site publié à 1 Go (limite officielle, pas toujours appliquée strictement).
- **Données** :
  - `media/works.json` (880 œuvres, identifiants `MS0001`…) est la source lue par le site public (`catalogue.js`, `works-catalog.js`).
  - `site-v2/site-catalog.js` interroge aussi Supabase (REST avec la clé anon + Edge Function `public-site-api`).
- **Config front** : `media/collectors-config.json` contient l'URL Supabase, les URL des Edge Functions et la clé anon.
- **Supabase** :
  - 18 migrations dans `supabase/migrations/`.
  - Tables : works, series, formats, techniques, publication/photo_statuses, media_types, work_series, related_media(+liaisons), collectors, work_messages, event_types, artist_events, artist_event_media.
  - 7 Edge Functions (`works-api`, `series-api`, `codes-api`, `collectors-api`, `events-api`, `resources-api`, `public-site-api`), toutes en `verify_jwt = false`, protégées par le secret `CATALOGUE_EDITOR_TOKEN`.
  - Pas de Supabase Storage utilisé.
- **Éditeurs** : `works-editor`, `series`, `codes-editor`, `collectors`, `events-editor`, `resources-editor`. Chacun a :
  - une version en ligne, qui passe par les Edge Functions ;
  - une API locale (`npm run works:import`, etc.) sur `127.0.0.1:4783x`, qui utilise la `SERVICE_ROLE_KEY` du `.env`.
- **Import d'œuvres** (en local uniquement) : copie des images, création des miniatures (sharp), mise à jour de Supabase et de `works.json`, puis `git commit` + `git push` (`scripts/works-git-publish.mjs`).

## Décision du 11/10/2026

- Pas de duplication Supabase : on **garde BaseArtMS** comme unique base, pour rester à 2 projets actifs avec foxbox.
- Le projet Supabase « BaseArt » (en pause) a été supprimé par l’utilisateur le 11/10/2026.

- Dépôt **`liskode/BaseArt`** (public) créé : catalogue et éditeurs seulement (option A). Les médias viennent de `https://mariesallantin.art/media/` (`baseart-config.js`).
- En ligne sur https://catalogue.mariesallantin.art (Pages, HTTPS forcé, certificat valide jusqu'au 09/01/2027).

## Points d'attention

- Le mot de passe éditeur apparaît en clair dans le dépôt public `mariesallantin` (docs) et **dans le code** : `editor-common.js` et `catalogue.js` (`EDIT_PASS`), ainsi que comme valeur par défaut dans les 6 Edge Functions. À traiter : vérification côté serveur uniquement + nouveau secret.
- Références à `leezsypadtvypdgqgvtk` et `mariesallantin.art` codées en dur dans environ 20 fichiers (éditeurs, scripts, `CNAME`, `sitemap.xml`, config).
- « Marie Sallantin » est codé en dur dans les pages du site vitrine (`index`, `cv`, `fap`, `liens`, `site-v2/`).
- `catalogue.mariesallantin.art` a un CNAME vers `liskode.github.io` (OK côté DNS), mais aucun dépôt ne déclare ce domaine : GitHub renvoie 404.
