# Vérifications

Exécuter les tests de comportement sans dépendances :

```sh
node --test tests/interactions.cjs tests/theme.cjs
```

Ils couvrent la navigation, le focus clavier, les filtres, la galerie, la carte
chargée à la demande, la suspension des animations et le thème clair/sombre.
Le DOM simulé ne vérifie pas la mise en page ni le rendu d’un navigateur.

Contrôle visuel automatisé effectué dans Edge (moteur Chromium) : les cinq pages
en clair et en sombre, à 320, 390, 768, 1024 et 1280 pixels, sans débordement
horizontal, sans erreur JavaScript et avec un contraste suffisant.

Reste à contrôler à la main sur de vrais appareils :

- Safari iOS et Firefox (moteurs différents de Chromium).
- Zoom à 200 %, rotation de l’écran pendant que le menu est ouvert.
- Lecteur d’écran (VoiceOver, TalkBack).
