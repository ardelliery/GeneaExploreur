# GeneaExploreur
IHM Web de navigation dans un arbre généalogique avec une visualisation géographique

Format du fichier en entrée: 

{
  "nodes": [
    {"id": "1", "firstname": "Jean", "surname": "Dupont", "birth": 1850, "place": "Paris"},
    {"id": "2", "firstname": "Marie", "surname": "Durand", "birth": 1855, "place": "Lyon"}
  ],
  "links": [
    {"source": "1", "target": "2", "type": "marriage"},
    {"source": "1", "target": "3", "type": "parent"}
  ]
}

A noter que les liens parent sont orientés parent vers enfant