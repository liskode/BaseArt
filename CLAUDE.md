# BaseArt — catalogue raisonné Marie Sallantin

Site statique (HTML/CSS/JS vanilla, sans build) publié par GitHub Pages sur **https://catalogue.mariesallantin.art** (dépôt `liskode/BaseArt`, branche `main`, racine).
Contient uniquement le **catalogue** (`catalogue.html`) et les **éditeurs** (`works-editor`, `series`, `codes-editor`, `collectors`, `events-editor`, `resources-editor`).

## Architecture
- **Base de données** : Supabase `BaseArtMS` (ref `leezsypadtvypdgqgvtk`), partagée avec le site `mariesallantin.art` et avec le **site-v2** (`https://mariesallantin.art/site-v2/`, futur site principal, via l'Edge Function `public-site-api`). Toute modification de schéma ou d'Edge Function doit rester compatible avec ces sites.
- **Mot de passe éditeur** : vérifié uniquement côté serveur (`EditorCommon.verifyPassword` → `works-api`, secret `CATALOGUE_EDITOR_TOKEN`). Ne jamais le réécrire dans le code.
- **Médias** (works.json, catalog-state.json, images `catalogue/`, miniatures `catalogue/_thumbs/`) : **pas dans ce dépôt**, chargés depuis `https://mariesallantin.art/media/` (réglé dans `baseart-config.js` → `MEDIA_BASE`). CORS `*` côté GitHub Pages.
- **Config Supabase front** : `media/collectors-config.json` (URL + clé anon publique + URL des Edge Functions). Jamais de `service_role` dans le front.
- **Éditeurs en ligne** → Edge Functions (`supabase/functions/*`, `verify_jwt = false`), protégées par le secret `CATALOGUE_EDITOR_TOKEN`.
- **Import d'œuvres** (images + miniatures + works.json + git push) : se fait **dans le dépôt `liskode/mariesallantin`**, cloné localement dans `~/Documents/BaseArtImport` (`cd ~/Documents/BaseArtImport && npm run works:import`), pas ici.

## Développement local
```bash
python3 -m http.server 8765   # puis http://localhost:8765/catalogue.html
```
(configuré dans `.claude/launch.json` sous le nom `baseart`)

## Conventions
- Interface et commentaires en français.
- Identifiants œuvres `MS0001`…; codes séries/formats/techniques gérés en base.
- Ne jamais committer de secret (`.env`, mot de passe éditeur, `service_role`).
- `supabase/` : migrations et Edge Functions (copie de référence reprise de `mariesallantin` le 11/10/2026). Déploiement : `supabase functions deploy <nom> --no-verify-jwt --project-ref leezsypadtvypdgqgvtk`.

## Deux dépôts, fichiers partagés
- `works-editor.js`, `catalogue.css`, `editor-common.js` et `supabase/` existent dans BaseArt **et** dans `~/Documents/BaseArtImport` (dépôt `mariesallantin`). Modifier dans BaseArt puis **recopier à l'identique** dans BaseArtImport (la version BaseArt fonctionne dans les deux grâce au repli `media/` de `MEDIA_BASE`).
- Lectures de listes Supabase : toujours via `fetchAll` (tranches de 1000, ordre stable) — PostgREST plafonne à 1000 lignes.
- Migrations appliquées avec `supabase db query --linked -f <fichier>` depuis BaseArtImport (projet lié), après accord de l'utilisateur.

## Qualité photo, in situ, doublons (14/10/2026)
- `works.image_quality` (0–100) + `image_quality_details` : `scripts/image-quality.mjs`, `npm run works:quality`. Pastille dans l'éditeur à côté du code MS.
- `work_photos` / `work_photo_links` / `work_photo_types` : « autres photos » des œuvres, hors catalogue raisonné (atelier, exposition, chez un collectionneur, combinaison de tableaux, détail, autre), rattachées à une ou plusieurs œuvres. Un diptyque / polyptyque est **une seule œuvre** (format DIPT, série POLYP) ; la photo d'un seul panneau est un détail.
- `work_similarities` : doublons possibles (distance Vision), statut `open` / `dismissed`. Seuils : < 0,33 même œuvre ; 0,33–0,47 doublon possible ; > 0,47 œuvres différentes.

## Import d'un export de photothèque
- `npm run export:analyse -- <dossier>` : chaîne complète (Vision → qualité → scènes → `_baseart/triage.json`). Les décisions sont rattachées aux mêmes photos même si les numéros de carte changent. À relancer après un import pour rafraîchir les suggestions.
- Outils Vision : `tools/vision/*.swift`, compilés à la demande par `scripts/vision.mjs` (cache des empreintes : `.cache/vision/`).
- Page de tri : Importer (nouvelles œuvres, codes MS jamais réutilisés), Remplacer les photos cochées, Ajouter les autres photos (`media/photos/`), Publier. Originaux : `~/Documents/BaseArt-originaux/` ; archives : `~/Documents/BaseArt-archives/`.
- Doublons entre œuvres : `npm run works:similar` remplit `work_similarities` ; outil ♊ de l'éditeur (routes works-api `/api/similar`, `/api/works/merge`).
- `npm run export:tri -- <dossier>` : page de tri http://127.0.0.1:47840/, décisions dans `_baseart/decisions.json`.
- Export actuel : `~/Documents/BaseArt_Export_iPhoto` (2108 photos, 14/10/2026).
- **Tri en ligne (artiste)** : https://catalogue.mariesallantin.art/tri-photos.html (mot de passe éditeur ; lien « Tri des photos » dans l'éditeur). Données : Edge Function `triage-api`, tables `photo_triage_exports` / `photo_triage_decisions` (la base fait foi), images de travail dans le stockage `tri-photos` (≈ 390 Mo, à supprimer après l'import). Mise en ligne / resynchro : `npm run export:en-ligne -- <dossier>`. Décisions : `duplicate` (+ `work`, `keep` = 'catalogue' ou nom de photo → remplacement), `new` (+ `best`), `situ` (+ `best`, `situ_type`, `situ_works`, `later`), `ignore`.
