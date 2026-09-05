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

Les journées consécutives au même endroit sont regroupées en un seul séjour, qui couvre
exactement les jours de ses nuits. Il ne déborde pas sur le lendemain : sinon le jour du retour
serait compté deux fois, dans le pays quitté et dans celui rejoint, et le total des jours
dépasserait celui des nuits.

Les journées sans hébergement sont rattachées au domicile et comptées en France. Sur le planning
d'août 2026, cela donne 20 nuits d'escale et 11 jours au domicile, soit les 31 jours du mois sans
trou ni recouvrement.

Avant d'importer, renseigne dans les réglages les **aéroports de logement en base**
(par exemple `DUS`). Les nuits qui s'y déroulent seront classées en présence en base plutôt qu'en
escale : elles relèvent de la double résidence, pas du courrier. Sans ce réglage, tout est traité
en escale.

Un écran de prévisualisation montre ce qui a été détecté avant enregistrement. Les séjours déjà
présents ne sont pas dupliqués. Seul le pays est enregistré, la ville n'entre pas dans le calcul.

Deux particularités de ces documents sont prises en charge. Ils sont imprimés **en paysage** :
la page est stockée tournée, et les coordonnées brutes du texte suivent l'orientation de stockage,
pas ce qui s'affiche. La matrice d'affichage est donc appliquée, faute de quoi les colonnes
visuelles seraient lues comme des lignes. Et le texte, en police à chasse fixe, arrive souvent
fragmenté, parfois lettre par lettre : les mots sont recomposés d'après l'espacement réel entre
les fragments.

Le planning étant sur trois colonnes, une même hauteur porte fréquemment un hébergement pour
chacune : toutes sont lues, et un contrôle de distance empêche qu'un code de lieu soit attribué
à la colonne voisine.

Si un import échoue, le message d'erreur indique le nombre de pages, la rotation détectée, le
nombre d'éléments de texte lus et le début du texte, ce qui suffit à identifier le problème.

### Déclaration Urssaf

**Revenus → Importer une déclaration Urssaf**, sélection multiple possible. L'app relève la
période, le SIRET, l'option de versement libératoire, la ventilation du chiffre d'affaires par
nature (BNC, BIC ventes, BIC prestations) et le détail des prélèvements.

La ventilation par nature ne se fie pas aux libellés. Sur ces récapitulatifs, le libellé d'une
nature s'étale sur trois ou quatre lignes alors que les montants restent alignés sur la première :
chercher le montant sous le libellé le rattacherait au bloc précédent. L'app part donc des lignes
qui portent un montant dans la colonne du chiffre d'affaires, et identifie la nature par le
**taux de cotisation** affiché — 25,6 % en BNC, 21,2 % en prestations BIC, 12,3 % en ventes.
Ce taux est propre à chaque régime et ne prête à aucune ambiguïté.

Les montants à quatre chiffres sont recollés avant lecture : le séparateur de milliers les éclate
en fragments, et « 1 159 € » serait lu 159 €.

La ligne « Montant totaux » n'est pas indispensable : à défaut, les totaux se déduisent de la
ventilation.

Trois contrôles sont menés avant l'enregistrement : la ventilation par nature doit reconstituer le
chiffre d'affaires total, la somme des cotisations, de la CFP et du versement libératoire doit
égaler le montant dû, et les prélèvements doivent correspondre aux taux du régime. Toute
divergence est affichée en clair.

Une déclaration Urssaf fait foi : dès qu'il en existe une pour l'année, c'est elle qui alimente le
chiffre d'affaires du bilan. Les recettes saisies à la main servent alors de contrôle, et tout écart
entre les deux est signalé.

Si le versement libératoire est détecté, le réglage correspondant est activé automatiquement : il
change les cases de report du chiffre d'affaires.

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

**Séjours.** Le journal est découpé par mois, chacun refermé par son décompte de séjours, de nuits
et d'indemnités. Le plus simple est d'importer le roster. Sinon, chaque rotation se saisit avec ses dates. Le décompte des jours par
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

## Supprimer plusieurs entrées

Chaque liste porteuse de données — dépenses, séjours, bulletins, recettes, déclarations Urssaf —
a un bouton **Modifier** dans son en-tête. Il fait apparaître une case devant chaque ligne et une
barre d'actions en bas de l'écran, avec le nombre d'éléments cochés, un bouton pour tout
sélectionner d'un coup et la suppression.

Pendant la sélection, appuyer sur une ligne la coche au lieu de l'ouvrir. La suppression demande
confirmation et efface aussi les justificatifs attachés. Changer d'onglet quitte le mode et
abandonne la sélection.

Un bouton **Modifier** n'apparaît que si sa liste contient quelque chose. Sur l'écran Revenus,
celui du haut agit sur les déclarations Urssaf, qui sont la source du chiffre d'affaires ; un
second apparaît sous le tableau dès que des recettes ont été saisies à la main.

Le filtre et la recherche restent actifs en mode sélection : « Tout » ne coche que les lignes
effectivement affichées, ce qui permet par exemple de supprimer d'un coup toutes les dépenses
d'un poste donné.

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

Quatre garde-fous sont intégrés :

- **Hébergement fourni.** Une indemnité journalière de mission à l'étranger se ventile en 65 %
  pour l'hébergement et 35 % pour la restauration, soit deux repas à 17,5 %. L'arrêté du
  3 juillet 2006, article 3, prévoit une réduction de 65 % lorsque l'agent est logé gratuitement.
  Chaque séjour porte donc un indicateur « hôtel payé par la compagnie », coché par défaut à
  l'import puisque les hôtels du roster sont des réservations employeur, et la part retenue est
  fixée à 35 %. **Le prix réel de l'hôtel n'a pas à être connu** : le barème est forfaitaire et sa
  ventilation est réglementaire.

- **Demi-indemnité de retour.** Elle ne s'accorde qu'au terme d'une rotation, sur le séjour suivi
  d'un retour au domicile — pas sur chaque escale d'un enchaînement. Pour le dernier séjour d'une
  période importée, rien n'est accordé puisque la suite est inconnue ; la case reste cochable.

- **Per diem supérieur au forfait.** Si la compagnie verse plus que le barème ne permet de déduire,
  opter pour le forfait fait réintégrer plus qu'il ne fait déduire. Le tableau de bord le signale.

- **Pas de double déduction.** Quand le forfait est actif, les dépenses de repas, hébergement et
  transports en escale cessent d'être comptées séparément. Le montant écarté reste affiché.
- **Per diem déduit.** Les indemnités déjà versées par la compagnie (`202F`) sont prises en compte.
  Deux méthodes au choix : réintégrer le per diem au salaire déclaré et déduire le forfait entier
  (méthode par défaut, celle attendue par l'administration), ou ne déduire que le solde.
- **Séjours non éligibles écartés.** La présence en base d'affectation relève de la double
  résidence, pas de l'escale, et les missions Air One Aero ne sont pas du salariat. Ces séjours
  sont exclus du calcul.

Les justificatifs à conserver sont le roster, qui prouve les dates et les lieux de découché, les
bulletins, qui prouvent le per diem reçu, et le barème de l'année. Aucune facture d'hôtel n'est
requise pour la part forfaitaire.

Le tableau de bord signale par ailleurs tout total de frais dépassant 55 % du salaire déclaré.
Une déclaration de cet ordre attire l'attention et doit pouvoir être justifiée ligne par ligne.

## Estimation de l'impôt

L'écran Bilan ouvre sur une estimation du solde à payer, construite à partir du barème progressif,
du quotient familial et de la décote.

La chaîne de calcul : salaires déclarés, moins la déduction la plus favorable entre l'abattement de
10 % et les frais réels ; plus les autres revenus nets saisis dans les réglages ; plus le chiffre
d'affaires micro après abattement. Le barème s'applique au revenu par part, la décote vient en
déduction, puis le crédit d'impôt étranger et ce qui a déjà été prélevé.

Avec le versement libératoire, le chiffre d'affaires sort du barème mais reste retenu pour
déterminer le taux appliqué aux autres revenus. L'app calcule l'impôt sur l'ensemble puis n'en
garde que la fraction correspondant aux revenus réellement soumis au barème.

Un barème ne vaut que pour une année de revenus, et il n'est voté qu'à la fin de celle-ci. Tous
les paramètres fiscaux sont donc **rattachés à l'année sélectionnée en haut de l'écran** : barème,
décote, parts, autres revenus et montant déjà prélevé. Consulter une année passée continue
d'utiliser le barème qui lui était applicable, et enregistrer le barème 2026 en 2027 ne modifiera
pas rétroactivement la déclaration 2025.

Deux barèmes sont fournis :

| Tranche par part | Revenus 2024 | Revenus 2025 |
|---|---|---|
| 0 % | jusqu'à 11 497 € | jusqu'à 11 600 € |
| 11 % | 29 315 € | 29 579 € |
| 30 % | 83 823 € | 84 577 € |
| 41 % | 180 294 € | 181 917 € |
| 45 % | au-delà | au-delà |
| Décote | 889 / 1 470 € | 897 / 1 483 € |
| Plafond de décote | 1 964 / 3 248 € | 1 982 / 3 277 € |

Décote : forfait moins 45,25 % de l'impôt brut, article 197-I-4 du CGI.

Pour une année sans barème publié, celui de l'année connue la plus proche est utilisé et
l'estimation est signalée comme provisoire, dans les réglages comme dans le bilan. Un barème saisi
à la main n'est enregistré que s'il diffère de l'officiel : sans quoi l'année continue de suivre
les mises à jour.

L'estimation ignore les réductions et crédits d'impôt, le plafonnement du quotient familial et les
revenus de capitaux. Elle sert à savoir où l'on va, pas à remplacer le simulateur officiel.

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
