# Content Factory v2 — Format long + Organisation Telegram par projet — Design

Ce document étend le design initial (`2026-08-19-content-factory-design.md`)
avec deux évolutions demandées par Sacha après la mise en production du
pipeline v1 : un format vidéo long (20-30 min) en parallèle du format
court existant, et une organisation Telegram qui garde chaque flux de
contenu séparé à mesure que Sacha ajoute des projets.

## 1. Problème & objectifs

Sacha veut, pour un même sujet YouTube Stories, produire **deux contenus
différents** — pas juste deux formats d'un même montage :

- un **format court** 9:16 (déjà en prod) pour TikTok + YouTube Shorts ;
- un **format long** 16:9, 20-30 min, pour YouTube — un contenu
  beaucoup plus détaillé sur la même histoire, pas un simple ré-habillage
  du script court.

Les deux se déclenchent **ensemble**, à partir du **même sujet**, mais
sont écrits **indépendamment** (pas d'expansion mécanique du script
court — cohérence de détail non garantie entre les deux, accepté par
Sacha).

Pour le format long, Sacha ne veut **pas** que Claude génère de visuels
de scène ni ne monte la vidéo — il s'en charge lui-même. Claude ne
produit que : script, voix off, 3 propositions de titre/description/
hashtags, et 3 miniatures à fort taux de clic.

À mesure que Sacha ajoute des projets/niches (autres chaînes, autres
business), il veut que le suivi de chaque flux de contenu reste
clairement séparé sur Telegram, pour ne pas s'y perdre.

### Non-goals (v2)

- Génération de visuels de scène ou montage vidéo pour le format long
  (Sacha s'en charge lui-même, en dehors du système).
- Publication automatique — toujours hors périmètre (inchangé depuis v1).
- Renommage ou migration des autres décisions v1 (Drive pour le texte
  seul, livraison vidéo directe par Telegram, déclenchement manuel) —
  inchangées, voir le design v1.

## 2. Architecture — projets "business" à sous-flux multiples

Un dossier projet (ex. `YoutubeStories/`) devient un **dossier business**
avec un calendrier de sujets **partagé**, et un ou plusieurs **sous-flux**
qui piochent dedans — aujourd'hui `short` et `long`, potentiellement
d'autres formats pour de futurs projets.

```
YoutubeStories/
├── config.yaml            # niche, ton, cadence — partagés entre les sous-flux
├── calendar/
│   └── 2026-10.md          # pool de sujets partagé, voir §4
├── short/
│   ├── config.yaml         # spécifique au format court
│   └── remotion/           # template Remotion (composition Vertical)
└── long/
    └── config.yaml         # spécifique au format long
```

Un projet n'a pas forcément les deux sous-flux : un futur projet peut
n'avoir qu'un `short/`, ou qu'un `long/`, ou un autre sous-flux
totalement différent plus tard — le moteur ne connaît aucun sous-flux en
dur, il lit ce que le dossier business contient.

### `config.yaml` — niveau business

```yaml
name: "YouTube Stories"
slug: youtube-stories
niche: "Histoires business et histoires incroyables (entrepreneurs, retournements de situation, anecdotes vraies bluffantes)"
tone: "narratif, immersif, rythmé, avec un twist ou une révélation"
cadence: "2x/semaine (lundi et jeudi)"
```

### `short/config.yaml`

```yaml
platforms: [tiktok, youtube]
format: 9:16
voice: true
telegram_topic_id: <id du topic "YT Stories — Court">
telegram_label: "📺 YT Stories — Court"
```

### `long/config.yaml`

```yaml
platforms: [youtube]
format: 16:9
voice: true
generate_visuals: false        # pas de scènes/vidéo — script + voix + miniatures only
target_duration_minutes: [20, 30]
target_word_count: [3000, 4500]  # ~150 mots/minute de narration
telegram_topic_id: <id du topic "YT Stories — Long">
telegram_label: "📺 YT Stories — Long"
```

`generate_visuals: false` est le signal que le skill utilise pour sauter
entièrement les étapes de génération de scènes et de rendu Remotion (voir
§3). Un futur sous-flux avec `generate_visuals: true` mais sans son
propre dossier `remotion/` serait une erreur de config détectée avant
génération (pas un cas géré silencieusement).

## 3. Flux de génération

Un seul déclenchement ("génère la prochaine vidéo YouTube Stories")
exécute, dans l'ordre :

1. Lit `YoutubeStories/config.yaml` (niche/ton) et
   `YoutubeStories/calendar/YYYY-MM.md`, prend le premier sujet sous
   `## À faire`.
2. Pour **chaque sous-flux présent** dans le dossier business (`short`,
   `long`, ou d'autres à l'avenir), lance une génération indépendante sur
   ce même sujet :
   - **Script** : rédigé indépendamment pour ce sous-flux, adapté à sa
     longueur cible (`target_word_count` si défini, sinon 300-600 mots
     comme le court) et au ton du business. Plus 3 propositions de
     titre/description/hashtags, adaptées aux `platforms` du sous-flux.
   - **Voix** : narration kie.ai TTS, comme en v1.
   - **Visuels + montage** : uniquement si `generate_visuals` n'est pas
     `false` (défaut : `true`, donc le comportement du sous-flux `short`
     ne change pas). Le sous-flux `long` saute cette étape et l'étape de
     rendu Remotion entièrement.
   - **Miniatures** : toujours générées — 2-3 variantes pour `short`
     (inchangé depuis v1), exactement 3 variantes "fort taux de clic"
     pour `long` (c'est la seule génération d'image du sous-flux
     `long`).
   - **Archive Drive** : script complet archivé en texte, comme en v1,
     dans le même dossier Drive `<config.name>/<YYYY-MM>/` mais avec un
     suffixe de sous-flux dans le nom de fichier (ex.
     `2026-10-01-court-script.txt` / `2026-10-01-long-script.txt`) pour
     ne pas écraser l'un avec l'autre.
   - **Livraison Telegram** : envoyée dans le **topic** du sous-flux
     (voir §5), jamais dans le topic général du groupe.
3. Le sujet du calendrier partagé se dédouble en deux lignes de suivi
   indépendantes dès cette étape (voir §4) — chaque sous-flux avance
   ensuite à son propre rythme de validation.

Les étapes de génération des différents sous-flux (script/voix/visuels
de `short`, script/voix/miniatures de `long`) sont indépendantes entre
elles et peuvent être lancées sans attendre la fin de l'autre sous-flux,
même logique que pour les appels indépendants au sein d'un même
sous-flux (déjà appliqué en v1).

## 4. Calendrier — sujet partagé, suivi par sous-flux

Le calendrier mensuel garde ses 3 sections (`À faire` / `Généré` /
`Validé`), mais chaque ligne sous `Généré`/`Validé` porte maintenant un
sous-flux explicite :

```markdown
## À faire
- [ ] 2026-10-05 | Le pêcheur qui a trouvé un investisseur milliardaire échoué sur son bateau

## Généré (en attente de validation Telegram)
- [ ] 2026-10-05 | Le pêcheur... | sous_flux: short | telegram_message_id: 41
- [ ] 2026-10-05 | Le pêcheur... | sous_flux: long | telegram_message_id: 44

## Validé
```

Une fois un sujet pris dans `À faire`, il est retiré de cette section et
remplacé par une ligne `Généré` par sous-flux généré (pas de ligne
partagée restante). Chaque ligne avance vers `Validé` indépendamment,
selon les réponses reçues dans le topic Telegram correspondant — valider
`short` ne fait rien avancer pour `long`, et inversement.

`state/telegram.json` garde le même schéma `pending[message_id] = {...}`
qu'en v1, avec un champ `sous_flux` (`"short"` ou `"long"`) ajouté à
chaque entrée de type `"topic"`, pour que Poll mode sache quelle ligne de
calendrier mettre à jour.

## 5. Organisation Telegram — un groupe, des Topics par sous-flux

Les Topics (fils de discussion) de Telegram n'existent que dans les
**groupes** — pas dans une conversation privée 1-à-1 avec un bot, ce qui
est la configuration actuelle. Mise en place unique (accompagnée par
Claude, captures d'écran comme pour la création initiale du bot) :

1. Créer un groupe Telegram, y ajouter `@ContentFactorySD_Bot`.
2. Activer les **Topics** dans les paramètres du groupe.
3. Créer un topic par sous-flux existant, ex. "YT Stories — Court" et
   "YT Stories — Long".
4. Récupérer l'id de chaque topic et le chat id du groupe (différent du
   chat id de conversation privée actuel), et les renseigner dans `.env`
   (`TELEGRAM_CHAT_ID` devient l'id du groupe) et dans les
   `telegram_topic_id` de chaque `config.yaml` de sous-flux.

Toute la "Livraison Telegram" et le "Poll mode" du v1 restent
inchangés dans leur logique, à un ajout près : chaque appel
`sendMessage`/`sendPhoto`/`sendVideo` passe désormais le paramètre
`message_thread_id` du sous-flux concerné, et `getUpdates` filtre/route
les réponses par le `message_thread_id` de l'update plutôt que par le
mécanisme de correspondance "entrée `pending` la plus récente" utilisé en
v1 pour une conversation privée sans fils — un `message_thread_id`
explicite lève toute ambiguïté entre deux sous-flux en attente en même
temps, ce qui est désormais la norme (les deux se génèrent toujours
ensemble).

Pour un futur projet (nouvelle niche/chaîne), la mise en place ajoute
simplement un ou plusieurs nouveaux topics dans le même groupe — pas de
nouveau bot, pas de nouveau groupe.

## 6. Réutilisabilité pour les futurs projets

Confirmé, pas de redesign nécessaire : un nouveau projet business =
un nouveau dossier avec son `config.yaml` + `calendar/`, un ou plusieurs
sous-dossiers de sous-flux selon ses besoins (peut n'avoir qu'un `short`,
qu'un `long`, ou une autre combinaison à l'avenir), et un ou plusieurs
nouveaux topics Telegram dans le groupe existant. Le moteur partagé
(`content-factory` skill) ne change pas pour accueillir un nouveau
projet.

## 7. Gestion des erreurs

Inchangé par rapport au v1 (§9 du design v1) : 1 retry automatique par
étape kie.ai/Remotion, message d'erreur Telegram explicite (dans le bon
topic) si l'échec persiste, sujet laissé en l'état pour reprise. Pour le
sous-flux `long`, l'absence de génération de visuels/rendu réduit
d'autant le nombre de points de défaillance possibles par rapport à
`short`.

## 8. Migration du projet YoutubeStories existant

Le sous-flux `short` actuel (`YoutubeStories/config.yaml` +
`YoutubeStories/remotion/`) est déplacé tel quel vers
`YoutubeStories/short/`, avec son `config.yaml` scindé entre les champs
qui deviennent business-level (`name`, `slug`, `niche`, `tone`,
`cadence`) et ceux qui restent spécifiques au sous-flux (`platforms`,
`format`, `voice`, `telegram_topic_id`, `telegram_label`). Le calendrier
existant (`YoutubeStories/calendar/`) reste à la racine du dossier
business, inchangé dans son contenu (les sujets déjà `Validé` ou
`Généré` gardent leurs lignes existantes telles quelles — pas de
réécriture rétroactive).

## 9. Hors périmètre / évolutions futures

- Génération automatique de visuels/montage pour le format long, si
  Sacha change d'avis plus tard — non prévu pour l'instant.
- Un sous-flux au-delà de `short`/`long` (ex. une version "compilation"
  ou "shorts multiples") — l'architecture le permettrait sans
  changement, mais rien n'est spécifié ici tant que le besoin n'existe
  pas.
