# Content Factory — Design

## 1. Problem & Goals

Sacha veut produire du contenu vidéo (scripts, voix, visuels, montage) pour
plusieurs projets/niches (YouTube, TikTok, Instagram) de façon automatisée,
sans avoir à faire la production lui-même. Il garde le contrôle final : il
valide ou demande des modifications sur Telegram avant de poster
manuellement sur les plateformes. La publication automatique sur les
réseaux sociaux est explicitement hors périmètre pour l'instant.

Le système doit être générique : un nouveau projet (nouvelle niche,
nouvelle plateforme) doit pouvoir être ajouté sans réécrire le moteur.

### Non-goals (v1)

- Publication automatique sur TikTok / Instagram / YouTube (Sacha poste
  lui-même, manuellement).
- Gestion des comptes réseaux sociaux (auth, tokens plateforme).
- Chat Telegram temps réel instantané (voir §5, choix assumé : polling).

## 2. Vue d'ensemble de l'architecture

Un dépôt Git unique, `Business/`, contient :

- un **skill Claude partagé** (`content-factory`) qui encapsule tout le
  savoir-faire de production (script, voix, visuels, montage, envoi
  Telegram, interprétation des retours) ;
- un **sous-dossier par projet** (ex. `YoutubeStories/`) contenant la
  configuration et le calendrier de ce projet, aucune logique dupliquée ;
- des **routines planifiées Claude Code** (cron) qui invoquent le skill
  partagé avec la config d'un projet donné — ce sont les "sous-agents"
  mentionnés par Sacha.

Les fichiers volumineux générés (vidéos, miniatures) sont envoyés
directement en pièce jointe sur Telegram (streamés depuis le disque
local, jamais via un stockage intermédiaire ni via le contexte du
modèle) — le repo Git ne contient que texte/config, pas de binaires
lourds. Voir §8 pour le raisonnement détaillé derrière ce choix.

```
                ┌─────────────────────────┐
                │   skill: content-factory │  (moteur partagé, dans Business/.claude/skills/)
                └────────────┬────────────┘
                             │ invoqué par
   ┌─────────────────────────┼─────────────────────────┐
   │                         │                         │
routine: generate     routine: monthly-plan     routine: telegram-poll
(1 par projet,         (1 par projet,            (partagée, ~15 min)
 cadence propre)        début de mois)
   │                         │                         │
   ▼                         ▼                         ▼
config projet +         propose N sujets          lit les nouveaux
prochain sujet          → Telegram → validation    messages Telegram,
du calendrier           → remplit calendar/         route vers le bon
                                                     projet/sujet, déclenche
                                                     validation ou régénération
```

## 3. Structure des fichiers

```
Business/
├── .claude/
│   └── skills/
│       └── content-factory/        ← skill moteur partagé (SKILL.md + scripts)
├── docs/superpowers/specs/         ← ce document et les suivants
├── state/
│   └── telegram.json               ← curseur de polling + mapping message↔projet↔sujet
├── YoutubeStories/
│   ├── config.yaml                 ← niche, ton, format(s), voix on/off, cadence, style
│   ├── calendar/
│   │   └── 2026-08.md              ← sujets du mois, statut (à_faire/généré/validé/rejeté)
│   └── remotion/                   ← template Remotion propre à ce projet (habillage visuel)
└── (futurs projets: même structure)
```

### `config.yaml` (schéma par projet)

```yaml
name: "YouTube Stories"
slug: youtube-stories
niche: "Histoires business / histoires incroyables"
platforms: [youtube]
formats: [9:16, 16:9]        # génère les deux à partir du même script
voice: true                   # narration IA requise
cadence: "2x/semaine"         # jours cibles définis par la routine cron associée
tone: "narratif, immersif"
telegram_label: "📺 YT Stories"
```

Un nouveau projet = un nouveau sous-dossier + son `config.yaml` + sa
routine cron. Le moteur ne connaît aucun projet en dur.

## 4. Flux de génération (un cycle)

1. La routine du projet se déclenche (cron, cadence propre au projet).
2. Elle appelle le skill `content-factory` avec le chemin du projet.
3. Le skill lit `calendar/` et prend le prochain sujet au statut
   `à_faire`.
4. **Script** : Claude rédige le script adapté à la niche/ton, plus **3
   propositions** de titre + description + hashtags.
5. **Voix** (si `voice: true`) : génération de la narration via kie.ai TTS.
6. **Visuels/vidéo** : génération des visuels/clips via kie.ai selon le
   script.
7. **Miniatures** : génération de **2-3 variantes** de couverture via
   kie.ai `generate_image`.
8. **Montage** : assemblage Remotion dans chaque format listé dans
   `formats` (9:16 et/ou 16:9), rendu final.
9. **Livraison Telegram** : envoi direct des vidéo(s) rendues (en pièce
   jointe, streamées depuis le disque local — pas de service de stockage
   intermédiaire) + miniatures + les 3 propositions de titre/description/
   hashtags, avec le libellé du projet. Le sujet passe au statut
   `en_attente_validation`, l'ID du message Telegram est enregistré dans
   `state/telegram.json` pour le routage des réponses.
10. La routine se termine (elle ne reste pas active en attente d'une
    réponse — voir §5).

## 5. Boucle de validation Telegram

**Choix assumé (validé avec Sacha) : polling, pas de bot temps réel.**
Alternative écartée : une app dédiée (ex. Vercel) avec chat Telegram
instantané — écartée car elle demanderait de reconstruire hors de Claude
Code des capacités déjà disponibles nativement ici (kie.ai, Remotion), au
prix d'une infra et d'une maintenance séparées, pour un gain (instantané
vs ~15 min) jugé non prioritaire.

- Une routine `telegram-poll` tourne toutes les ~15 minutes.
- Elle lit les nouveaux messages via l'API Telegram (`getUpdates`), en
  utilisant le curseur stocké dans `state/telegram.json`.
- Elle retrouve, via le mapping stocké, à quel projet/sujet chaque
  réponse correspond (réponse = reply à un message précis, ou dernier
  sujet `en_attente_validation` du projet si pas de contexte explicite).
- Si la réponse est une validation (ex. "ok", "valide") → statut du sujet
  passe à `validé` ; les vidéos ont déjà été reçues directement sur
  Telegram lors de la génération, Sacha les récupère depuis la
  conversation pour les poster lui-même.
- Si la réponse contient une demande de modification → la routine
  ré-invoque le skill `content-factory` en mode régénération ciblée
  (ex. "refais la voix", "change le titre 2") sur les seules étapes
  concernées, puis renvoie le résultat sur Telegram.

## 6. Planning mensuel

Une routine `monthly-plan`, par projet, se déclenche en début de mois (ou
quand le calendrier du projet est presque vide) :

1. Claude propose N sujets adaptés à la niche (`niche` + `tone` du
   config).
2. Envoi de la liste sur Telegram pour validation/ajustement par Sacha.
3. Une fois validée, la liste est écrite dans `calendar/YYYY-MM.md`
   avec statut `à_faire` pour chaque sujet.

## 7. Bot Telegram — mise en place

Un seul bot Telegram, partagé entre tous les projets (le libellé du
projet identifie la source de chaque message). Création via @BotFather
(processus accompagné, ~2 min), token stocké comme variable
d'environnement sécurisée sur les routines Claude Code — jamais en clair
dans le repo Git.

## 8. Livraison des fichiers générés

**Décision révisée pendant l'implémentation (Tâche 6) :** le plan
d'origine prévoyait un upload vers Google Drive avant l'envoi du lien sur
Telegram. En pratique, l'outil MCP Google Drive disponible n'accepte que
du contenu en base64 inline dans l'appel d'outil (pas d'upload par
streaming/URL) — inutilisable pour de vraies vidéos de 10-20 Mo sans
faire transiter le fichier entier, caractère par caractère, par le
contexte du modèle (risque réel de corruption silencieuse, en plus d'être
infaisable au-delà de quelques centaines de Ko).

Décision (validée avec Sacha) : les vidéos rendues sont envoyées
**directement en pièce jointe Telegram**, streamées depuis le disque
local via `curl -F` (comme les miniatures) — jamais de passage par le
contexte du modèle, jamais de risque de corruption. Fonctionne
confortablement sous la limite de 50 Mo de l'API Bot Telegram (rendus
actuels : ~15 Mo). Google Drive n'est plus utilisé par le pipeline.

Le repo Git ne contient toujours que du texte (config, calendrier,
état) : aucun binaire (vidéo, image) n'y est committé — les fichiers
générés vivent uniquement dans la conversation Telegram.

## 9. Gestion des erreurs

- Échec d'un appel kie.ai ou d'un rendu Remotion → 1 retry automatique ;
  si l'échec persiste, message d'erreur explicite envoyé sur Telegram
  (jamais d'échec silencieux), sujet laissé au statut `à_faire` pour
  reprise au cycle suivant ou manuellement.
- Échec d'envoi Telegram (ex. token invalide, rate limit) → retry avec
  backoff ; si toujours en échec, la routine se termine en erreur
  (visible dans les logs de routine).

## 10. Validation avant activation

Avant d'activer les routines planifiées : un test manuel bout-en-bout du
pipeline sur le projet YouTube Stories (un sujet réel, du script jusqu'à
la réception sur Telegram des vidéos + miniatures + 3 propositions de
titre/description/hashtags), pour valider l'enchaînement complet avant
mise en cron.

## 11. Hors périmètre / évolutions futures

- Publication automatique multi-plateforme (TikTok Content Posting API,
  Instagram Graph API, YouTube Data API) — envisageable en v2 une fois
  les comptes Business/Creator configurés, via APIs directes ou service
  tiers unifié (ex. upload-post.com) pour éviter l'audit TikTok / la
  revue Meta.
- Chat Telegram temps réel (app dédiée) si le délai de polling
  (~15 min) s'avère insuffisant en usage réel.
