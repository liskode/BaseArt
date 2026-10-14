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

- La racine du sous-domaine reste sur l'**ancienne consultation** (`catalogue.html`) jusqu'à ce que le site soit prêt et la base complète (objectif : printemps 2027, beaucoup de photos à refaire). On basculera alors vers la nouvelle version.
- Le travail se concentre sur **`works-editor`** (https://catalogue.mariesallantin.art/works-editor.html).

## Points d'attention

- Mot de passe éditeur : corrigé le 11/10/2026. Il est vérifié côté serveur uniquement (`EditorCommon.verifyPassword` → `works-api`), sans valeur par défaut, dans les deux dépôts et les 6 Edge Functions. Le changement du secret `CATALOGUE_EDITOR_TOKEN` (encore `MS75` au moment du déploiement) est à faire par l'utilisateur. `MS75` subsiste seulement dans l'ancienne `catalogue.html` et l'éditeur de légendes désactivé, sans accès serveur.
- Le site-v2 (`https://mariesallantin.art/site-v2/`) utilise la même base (Edge Function `public-site-api`, REST anon) et remplacera à terme `mariesallantin.art`. Toute modification de schéma ou de fonction doit rester compatible avec lui.
- Dossier d'import actif de l'utilisateur : `~/Documents/BaseArtImport` (clone de `liskode/mariesallantin`, avec `.env`).
- Références à `leezsypadtvypdgqgvtk` et `mariesallantin.art` codées en dur dans environ 20 fichiers (éditeurs, scripts, `CNAME`, `sitemap.xml`, config).
- « Marie Sallantin » est codé en dur dans les pages du site vitrine (`index`, `cv`, `fap`, `liens`, `site-v2/`).
- `catalogue.mariesallantin.art` a un CNAME vers `liskode.github.io` (OK côté DNS), mais aucun dépôt ne déclare ce domaine : GitHub renvoie 404.

## Pistes en attente (reprises de l'historique Cursor)

- ~~Ménage des images orphelines~~ : fait le 11/10/2026. 70 images + 79 miniatures archivées dans `~/Documents/BaseArt-archives/images-orphelines-2026-10-11/`, `works.json` aligné sur la base (845 œuvres). Le script d'analyse compare base, `media/catalogue`, `_thumbs` et `works.json`. Penser à refaire ce contrôle après de nouvelles suppressions : la suppression d'une œuvre dans l'éditeur n'efface ni l'image ni l'entrée de `works.json`.
- **Photos à refaire** : les nouvelles photos vont remplacer les anciennes (mode « Mise à jour image » de l'import). La détection de doublons par empreinte (SHA/phash) devra en tenir compte.
- **Contrôle de netteté** automatique des photos : idée évoquée, « pas maintenant ».
- **Multi-artistes** (ex. `mariesallantin.baseart.com` ou `baseart.com/mariesallantin`) : envisagé puis abandonné (« on ne change rien finalement »), mais ce serait la raison d'être du nom BaseArt.

## Séries à vérifier (14/10/2026)

Bug corrigé : l'éditeur ne lisait que 1000 des 1097 liens œuvre-série, et enregistrer une œuvre touchée effaçait ses séries non affichées. Ces 27 œuvres ont dans `works.json` des séries absentes de la base (retrait volontaire ou perte due au bug, impossible à distinguer) :

MS0092:CIEUX · MS0098:ENCRE+ENFER · MS0103:DANTE+ENCRE · MS0146:ATELI+JUGEM · MS0682:BAIGN · MS0797:ATELI+CIEUX · MS0798:CIEUX+ATELI · MS0799:ATELI+JUGEM · MS0810:CIEUX+ANGES · MS0825:CIEUX · MS0835:CIEUX · MS0847:CIEUX+ANGES · MS0867:CIEUX · MS0868:BAIGN+AUTOM+ETANG · MS0873:BAIGN+AUTOM+ETANG · MS0874:ETANG+BAIGN+PRINT · MS0880:BAIGN+AUTOM+ETANG · MS0883:ETANG · MS0884:ETANG+AUTOM · MS0885:BAIGN+AUTOM+ETANG · MS0886:BAIGN+AUTOM+ETANG · MS0887:ETANG · MS0889:ESTIV+ETANG+COMPA+BAIGN · MS0892:ETANG+ESTIV+COMPA+BAIGN · MS0896:COMPA+ESTIV+ETANG+BAIGN · MS0897:COMPA+ESTIV+ETANG+BAIGN · MS0901:COMPA+ESTIV+ETANG+BAIGN
