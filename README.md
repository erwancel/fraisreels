# Carnet de frais réels

Application web installable sur l'écran d'accueil de l'iPhone. Suivi des dépenses professionnelles
avec justificatifs photographiés, décompte des jours par pays, suivi des revenus, et export annuel
complet pour la déclaration.

Tout est stocké sur l'appareil. Aucune donnée ne transite par un serveur.

---

## Fichiers

```
index.html                structure des 5 écrans
styles.css                thème sombre et clair
store.js                  base de données locale, référentiels, calculs
exports.js                CSV, PDF, ZIP, sauvegarde
app.js                    interface
manifest.webmanifest      installation sur écran d'accueil
sw.js                     fonctionnement hors ligne
icons/                    icônes générées
```

---

## Déploiement sur Cloudflare Pages

1. Créer un dépôt GitHub et y pousser le contenu de ce dossier à la racine.
2. Sur Cloudflare Pages : **Create a project → Connect to Git**, sélectionner le dépôt.
3. Build command : laisser vide. Build output directory : `/`. Framework preset : `None`.
4. Déployer.

Le HTTPS est indispensable : sans lui, ni le service worker ni l'installation sur écran d'accueil
ne fonctionnent. Cloudflare Pages le fournit automatiquement.

À chaque modification, incrémenter `CACHE_VERSION` dans `sw.js` (`frais-reels-v1` → `v2`), sinon
l'ancienne version reste servie depuis le cache.

---

## Installation sur iPhone

1. Ouvrir l'adresse dans **Safari** (Chrome iOS ne sait pas installer de PWA).
2. Bouton Partager → **Sur l'écran d'accueil**.
3. Lancer l'app depuis l'icône : elle s'ouvre en plein écran, sans barre d'adresse.

Premier réglage : ouvrir l'engrenage en haut à droite, renseigner le nom, le domicile et la base,
puis appuyer sur **Protéger les données**. Cela demande à Safari de ne pas purger le stockage
en cas d'inactivité prolongée.

---

## Sauvegarde vers iCloud

Une application web ne peut pas écrire directement dans iCloud Drive sur iOS. Le circuit est donc :

**Bilan → Sauvegarder vers iCloud** → la feuille de partage iOS s'ouvre → **Enregistrer dans Fichiers**
→ choisir un dossier dans **iCloud Drive**.

Le fichier produit contient tout : dépenses, séjours, bulletins, recettes, réglages et l'intégralité
des photos. Un seul fichier à conserver.

Pour restaurer sur un nouvel appareil : installer l'app, puis **Bilan → Restaurer une sauvegarde**
et sélectionner le fichier depuis iCloud Drive.

L'écran d'accueil affiche un avertissement dès que la dernière sauvegarde remonte à plus de 30 jours.

---

## Import automatique

### Roster

**Séjours → Importer un roster**, puis sélectionne le PDF de ton planning individuel
(NetLine/Crew). L'app en extrait tes nuits hors domicile et reconstitue les séjours.

La règle appliquée : **une nuit compte lorsque le planning porte une ligne hôtel** (`H1 DUS`,
`H2 VIE`…). C'est le seul indice fiable. Un roster affiche souvent ta base contractuelle pendant
tes jours de repos alors que tu es rentré chez toi — sur le planning d'août 2026, les dix jours
`O_S PRG` du 15 au 24 n'ont aucun hébergement associé : ils ne sont pas comptés.

Les nuits consécutives au même endroit sont regroupées en un seul séjour. Un séjour par nuit
gonflerait le forfait d'escale, qui accorde une demi-indemnité de retour par séjour.

Avant d'importer, renseigne dans les réglages les **aéroports de logement en base**
(par exemple `DUS`). Les nuits qui s'y déroulent seront classées en présence en base plutôt qu'en
escale : elles relèvent de la double résidence, pas du courrier. Sans ce réglage, tout est traité
en escale.

Un écran de prévisualisation montre ce qui a été détecté avant enregistrement. Les séjours déjà
présents ne sont pas dupliqués. Seul le pays est enregistré, la ville n'entre pas dans le calcul.

Ces plannings sont produits en police à chasse fixe et le texte y est souvent fragmenté, parfois
lettre par lettre. Les mots sont donc recomposés d'après l'espacement réel entre les fragments.
Si un import échoue, le message d'erreur cite le début du texte réellement lu, ce qui permet de
voir tout de suite si le document a été mal découpé.

### Bulletin de paie

**Revenus → Importer un bulletin PDF**. Plusieurs fichiers peuvent être sélectionnés d'un coup.
L'app relève les lignes `/106`, `/350`, `/360`, `202F`, `/401` et `/559`, en **additionnant toutes
les périodes** de chaque code — c'est précisément l'étape où la saisie manuelle échoue.

Chaque montant est affiché dans les deux monnaies, séparées par une barre oblique
(`92 573,00 / 3 823,64 €`), au taux que l'employeur a lui-même appliqué sur le bulletin.

Le recoupement avec le virement est vérifié avant l'enregistrement et affiché dans la
prévisualisation. Un bulletin sans taux de change reprend celui d'un autre mois. Réimporter un mois
déjà présent le met à jour sans perdre le justificatif ni la mention d'impôt contesté.

Les PDF sont lus sur l'appareil. Aucun document n'est transmis.

## Utilisation

**Saisir une dépense.** Bouton `+`, montant, poste, photo du ticket. Les photos sont réduites à
1600 px et compressées : un ticket pèse environ 150 Ko au lieu de 3 Mo.

**Devises.** Si la dépense n'est pas en euros, choisir la devise : la conversion s'affiche
immédiatement. Les taux se modifient dans les réglages, une ligne par devise au format `CHF=1.07`.

**Quote-part.** Pour un abonnement téléphonique utilisé à 60 % professionnellement, indiquer 60 dans
« quote-part professionnelle » : seule cette fraction entre dans le total déductible.

**Remboursé par l'employeur.** Cocher la case exclut la ligne du total déductible tout en gardant la
trace de la dépense.

**Séjours.** Le plus simple est d'importer le roster. Sinon, chaque rotation se saisit avec ses dates. Le décompte des jours par
pays se construit tout seul, sans compter deux fois une journée passée dans deux pays.

**Revenus.** Le module bulletin est calé sur le format Eurowings Europe Ltd. Cinq lignes à recopier :

| Champ de l'app | Ligne du bulletin |
|---|---|
| Total payment devise / EUR | en-tête, donne le taux de change du mois |
| Base imposable | `/106 Eval.base tax` — additionner toutes les périodes affichées |
| Cotisations salariales | `/350 HI part EE` + `/360 SI part EE` (jamais les lignes `part ER`) |
| Per diem non imposable | `202F Travel tax free` |
| Impôt payé sur place | `/401 Tax advance, monthly` |

L'app convertit avec le taux du bulletin lui-même, plus défendable qu'un taux générique puisque le
document en porte la trace, et calcule la base retenue pour la déclaration française :
base imposable moins cotisations sociales obligatoires.

Attention aux périodes. Les `Service time payment` sont réglées avec un mois de décalage, et le
bulletin les rattache à leur période d'origine. Un bulletin d'août porte donc plusieurs lignes
`/106`, `/350` et `/360` pour des mois différents. **Il faut toutes les additionner.** L'oubli le
plus fréquent porte sur les cotisations régularisées d'un mois antérieur : sur le bulletin d'août
2026, ignorer les lignes `06/26` et `07/26` fait perdre 3 054 CZK de cotisations déductibles.

Le champ « Virement reçu » sert de garde-fou. L'app vérifie que
base imposable − cotisations − impôt + per diem = virement, et signale tout écart supérieur à
deux unités. Si le contrôle passe, la saisie est juste.

Quand un bulletin affiche `Total payment EUR: 0,00` — c'était le cas en juin 2026 — le taux doit
être saisi à la main. Reprendre celui d'un mois voisin ou le taux officiel de la période.

Si un impôt a été prélevé à tort et fait l'objet d'une demande de remboursement, coche la case
correspondante. Le montant reste compté dans le contrôle du virement, puisqu'il a bien été retenu,
mais il n'alimente pas le crédit d'impôt français tant qu'il n'est pas définitivement supporté.

Les recettes Air One Aero se ventilent par catégorie fiscale.

---

## Export annuel

**Bilan → Dossier complet (ZIP)** produit :

```
frais-reels-2026/
  recapitulatif-2026.pdf          synthèse, détail par poste, pays, journal complet
  depenses-2026.csv               tableau détaillé
  sejours-2026.csv                séjours et décompte par pays
  bulletins-2026.csv
  recettes-2026.csv
  justificatifs/
    P001_2026-03-14_repas_diner-escale-palma_23,40eur.jpg
    ...
  bulletins/
  factures/
```

Chaque justificatif porte un numéro de pièce qui correspond à la colonne « Pièce » du journal PDF.
Le dossier se transmet tel quel à un comptable.

---

## Frais en courrier

Le poste le plus important pour un navigant. Une indemnité forfaitaire par **nuit d'escale**, au
taux du pays où tu dors, plus une demi-indemnité le jour du retour en base.

Base juridique : instruction 5 F-1-99 du 30 décembre 1998 et lettre du directeur de la Législation
Fiscale n°99002172 du 15 février 1999, qui renvoie au barème du groupe II des indemnités
journalières servies aux personnels de l'État en mission temporaire à l'étranger.

Le module est **désactivé par défaut**. Les taux préchargés sont des ordres de grandeur relevés
dans la documentation syndicale : remplace-les par le document officiel de l'année déclarée, dans
Réglages → Frais en courrier. Un pays par ligne au format `CH=248`, la ligne `DEFAUT` couvrant la
zone euro et Schengen.

Trois garde-fous sont intégrés :

- **Pas de double déduction.** Quand le forfait est actif, les dépenses de repas, hébergement et
  transports en escale cessent d'être comptées séparément. Le montant écarté reste affiché.
- **Per diem déduit.** Les indemnités déjà versées par la compagnie (`202F`) sont prises en compte.
  Deux méthodes au choix : réintégrer le per diem au salaire déclaré et déduire le forfait entier
  (méthode par défaut, celle attendue par l'administration), ou ne déduire que le solde.
- **Séjours non éligibles écartés.** La présence en base d'affectation relève de la double
  résidence, pas de l'escale, et les missions Air One Aero ne sont pas du salariat. Ces séjours
  sont exclus du calcul.

## Le comparateur

L'écran d'accueil oppose deux montants :

- l'**abattement forfaitaire de 10 %** appliqué automatiquement par l'administration sur le salaire
  net imposable, entre un plancher et un plafond ;
- le **total des frais réels** justifiés.

Opter pour le réel n'a d'intérêt que si le second dépasse le premier. Les bornes de l'abattement
sont réévaluées chaque année : elles se corrigent dans les réglages, année par année.

Valeurs préchargées, à vérifier au moment de déclarer :

| Revenus | Plancher | Plafond |
|---------|---------|---------|
| 2024    | 504 €   | 14 426 € |
| 2025    | 509 €   | 14 555 € |
| 2026    | 509 €   | 14 555 € (provisoire) |

---

## Limites connues

Les codes de cases affichés dans l'écran Bilan sont indicatifs, celui du crédit d'impôt étranger
en particulier. Un salaire versé par une compagnie maltaise depuis une base tchèque à un résident
français relève d'une convention fiscale que l'application ne tranche pas : la base calculée est
une estimation à faire valider par un fiscaliste spécialisé en personnel navigant.

Le calcul retenu — base imposable locale moins cotisations sociales obligatoires — correspond à la
pratique courante pour un salarié cotisant à un régime obligatoire d'un État membre de l'Union.
Il ne préjuge pas du traitement des indemnités de déplacement, qui suivent des règles françaises
propres et ne sont pas automatiquement exonérées du seul fait qu'elles le sont localement.

En micro-entreprise, aucune charge n'est déductible du chiffre d'affaires. Les dépenses rattachées
à Air One Aero sont suivies pour information et n'entrent jamais dans le total des frais réels.

Les exports PDF et ZIP téléchargent trois bibliothèques au premier usage. Elles sont ensuite mises
en cache et restent disponibles hors ligne. Faire un export une fois en Wi-Fi avant de partir.
