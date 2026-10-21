# BEST BURGER — site vitrine

Site statique (HTML, CSS, JavaScript sans dépendance) du restaurant BEST BURGER,
9 Place du 11 novembre, 59230 Saint-Amand-les-Eaux.

En ligne : https://redahfir.github.io/best-burger/ (GitHub Pages, branche `master`).

## Structure

| Chemin | Rôle |
| --- | --- |
| `index.html`, `menu.html`, `galerie.html`, `contact.html`, `mentions-legales.html` | Pages |
| `css/styles.css` | Feuille de style unique (thèmes clair et sombre) |
| `js/theme.js` | Thème clair/sombre, chargé dans `<head>` pour éviter un flash |
| `js/script.js` | Navigation, filtres du menu, galerie, carte à la demande |
| `fidelite.html`, `carte.html`, `comptoir.html` | Carte fidélité : inscription, carte du client (Apple / Google Wallet), comptoir de l'équipe |
| `js/fidelite.js` | Pages fidélité ; l'adresse du serveur se règle en haut du fichier (`API_URL`) |
| `fidelite-api/` | Serveur de la carte fidélité, hébergé à part (voir son [README](fidelite-api/README.md)) |
| `fonts/` | Polices hébergées localement (Anton, Plus Jakarta Sans) |
| `img/produits/` | Photos produits (`*-sm.webp` = vignettes 320 px, `*-md.webp` = 600 px pour la galerie) |
| `img/ingredients/` | Viandes, sauces, suppléments |
| `img/ambiance/` | Fonds des en-têtes |
| `tests/` | Tests de comportement (`node --test tests/interactions.cjs tests/theme.cjs`) |

## Mettre à jour la carte

Les prix et produits sont dans `menu.html` (cartes `.menu-card`). Les trois
best-sellers de l'accueil sont dans `index.html` : penser à les mettre à jour aussi.

## Carte fidélité

Les clients créent leur carte sur `fidelite.html` puis l'ajoutent à Apple Wallet ou Google Wallet ;
l'équipe ajoute les tampons depuis `comptoir.html`. La signature des cartes nécessite le serveur
`fidelite-api/` et les identifiants Apple et Google du restaurant : tout est décrit dans
[fidelite-api/README.md](fidelite-api/README.md). Tant que `API_URL` est vide dans `js/fidelite.js`,
la page affiche « bientôt disponible ».

## Confidentialité

Aucun cookie, aucune mesure d'audience, aucune police chargée depuis Google.
La carte fidélité n'enregistre que les données nécessaires (voir `mentions-legales.html#fidelite`).
La carte Google Maps de la page Contact ne se charge qu'après un clic.

## À compléter

`mentions-legales.html` : raison sociale, SIRET, TVA et responsable de la publication
(repérés par « [à compléter] »).
