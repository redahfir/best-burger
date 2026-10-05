# Vérifications

Exécuter les tests de comportement sans dépendances :

```sh
node --test tests/interactions.cjs
```

Ils couvrent la navigation, le focus clavier, les filtres, la galerie et la suspension des animations. Le DOM simulé ne vérifie pas la mise en page ni le rendu d’un navigateur.

Contrôle visuel à effectuer dans Chrome/Edge, Firefox et Safari, dont iOS et Android :

- Les quatre pages à 320, 390, 768, 980, 1024 et 1440 pixels, en portrait et paysage.
- Menu après défilement, écran peu haut, rotation et passage tablette/bureau.
- Zoom à 200 %, textes et boutons sans débordement horizontal.
- Tabulation, Maj + Tab, Échap et retour du focus après fermeture de la galerie.
- JavaScript désactivé : contenus et liens de navigation visibles.
- Préférence « réduire les animations » et chargement sans polices externes.

Le contrôle visuel n’a pas pu être exécuté pendant cette modification : l’accès au navigateur de prévisualisation était bloqué.
