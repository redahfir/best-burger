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
| `fonts/` | Polices hébergées localement (Anton, Plus Jakarta Sans) |
| `img/produits/` | Photos produits (`*-sm.webp` = vignettes du menu) |
| `img/ingredients/` | Viandes, sauces, suppléments |
| `img/ambiance/` | Fonds des en-têtes |
| `tests/` | Tests de comportement (`node --test tests/interactions.cjs tests/theme.cjs`) |

## Mettre à jour la carte

Les prix et produits sont dans `menu.html` (cartes `.menu-card`). Les trois
best-sellers de l'accueil sont dans `index.html` : penser à les mettre à jour aussi.

## Confidentialité

Aucun cookie, aucune mesure d'audience, aucune police chargée depuis Google.
La carte Google Maps de la page Contact ne se charge qu'après un clic.

## À compléter

`mentions-legales.html` : raison sociale, SIRET, TVA et responsable de la publication
(repérés par « [à compléter] »).
