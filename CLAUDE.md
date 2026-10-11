# BaseArt — catalogue raisonné Marie Sallantin

Site statique (HTML/CSS/JS vanilla, sans build) publié par GitHub Pages sur **https://catalogue.mariesallantin.art** (dépôt `liskode/BaseArt`, branche `main`, racine).
Contient uniquement le **catalogue** (`catalogue.html`) et les **éditeurs** (`works-editor`, `series`, `codes-editor`, `collectors`, `events-editor`, `resources-editor`).

## Architecture
- **Base de données** : Supabase `BaseArtMS` (ref `leezsypadtvypdgqgvtk`), partagée avec le site `mariesallantin.art` et avec le **site-v2** (`https://mariesallantin.art/site-v2/`, futur site principal, via l'Edge Function `public-site-api`). Toute modification de schéma ou d'Edge Function doit rester compatible avec ces sites.
- **Mot de passe éditeur** : vérifié uniquement côté serveur (`EditorCommon.verifyPassword` → `works-api`, secret `CATALOGUE_EDITOR_TOKEN`). Ne jamais le réécrire dans le code.
- **Médias** (works.json, catalog-state.json, images `catalogue/`, miniatures `catalogue/_thumbs/`) : **pas dans ce dépôt**, chargés depuis `https://mariesallantin.art/media/` (réglé dans `baseart-config.js` → `MEDIA_BASE`). CORS `*` côté GitHub Pages.
- **Config Supabase front** : `media/collectors-config.json` (URL + clé anon publique + URL des Edge Functions). Jamais de `service_role` dans le front.
- **Éditeurs en ligne** → Edge Functions (`supabase/functions/*`, `verify_jwt = false`), protégées par le secret `CATALOGUE_EDITOR_TOKEN`.
- **Import d'œuvres** (images + miniatures + works.json + git push) : se fait **dans le dépôt `liskode/mariesallantin`** (`npm run works:import`), pas ici.

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
