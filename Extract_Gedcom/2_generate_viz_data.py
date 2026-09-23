"""Module de génération du fichier de données JSON pour la visualisation.

Ce script croise les informations des individus et familles extraites du fichier
GEDCOM avec le référentiel géographique géolocalisé pour produire le fichier
JSON complet contenant les nœuds (individus) et les liens (mariages et
filiations) exploités par l'application web.

Affectation des lieux dans data.json :
- "place" : nouveau champ issu de GeoNames (place_geoname, 1er champ de liste_lieux_complet.csv)
- "place_orig" : champ place du GEDCOM (place, 2eme champ de liste_lieux_complet.csv)
"""

import csv
import json
import logging
import re
from gedcom.element.individual import IndividualElement
from gedcom.parser import Parser

# Configuration du système de journalisation (LOG)
logging.basicConfig(
    filename='final_data_production.log',
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    filemode='w',
    encoding='utf-8',
)

# Fichiers d'entrée et de sortie
GEDCOM_FILE = 'LoicMarion.ged'
PLACES_CSV = 'liste_lieux_complet.csv'
OUTPUT_FILE = 'data.json'


def get_year(date_str):
  """Extrait la première année à quatre chiffres trouvée dans une chaîne de date.

  :param date_str: La chaîne représentant une date au format GEDCOM.
  :type date_str: str or None
  :returns: L'année sous forme d'entier si elle est trouvée, sinon None.
  :rtype: int or None
  """
  if not date_str:
    return None
  match = re.search(r'\d{4}', date_str)
  return int(match.group()) if match else None


def main():
  """Fonction principale de génération des données JSON pour la visualisation."""
  # 1. Charger le référentiel géographique des lieux géolocalisés
  # Clé d'indexation : champ 'place' (correspond au lieu extrait du GEDCOM)
  geo_ref = {}
  try:
    with open(PLACES_CSV, 'r', encoding='utf-8') as f:
      reader = csv.DictReader(f)
      for row in reader:
        place_key = row.get('place', '').strip()
        lat = row.get('lat', '').strip()
        lon = row.get('lon', '').strip()

        # Un lieu est géolocalisé s'il possède lat et lon
        if place_key and lat and lon:
          geo_ref[place_key] = row
  except FileNotFoundError:
    print(f'Erreur : {PLACES_CSV} introuvable.')
    return

  # 2. Charger et parser le fichier GEDCOM
  gedcom_parser = Parser()
  gedcom_parser.parse_file(GEDCOM_FILE)
  all_elements = gedcom_parser.get_element_list()

  nodes = []
  links = []
  valid_ids = set()

  # 3. Création des Nœuds (Individus)
  for element in all_elements:
    if isinstance(element, IndividualElement):
      ptr = element.get_pointer()  # ID unique (ex: '@I1@')
      birth = element.get_birth_data()  # Tuple (date, lieu) ou None
      year = get_year(birth[0]) if birth else None
      if year is None:
        year = 0
      place_gedcom = birth[1].strip() if birth and birth[1] else ''

      logging.info(f'>>> traite {ptr}, year={year}, place={place_gedcom}')

      # Gestion du statut de décès
      deceased = 0
      death_year = 0
      if element.is_deceased():
        deceased = 1
        death_year = element.get_death_year() or 0

      # Nettoyage des noms
      name = element.get_name()
      surname = name[1].replace('/', '') if len(name) > 1 else 'Inconnu'
      firstname = name[0] if len(name) > 0 else ''

      # Construction du nœud selon la géolocalisation
      if place_gedcom in geo_ref:
        geo_info = geo_ref[place_gedcom]
        nodes.append({
            'id': ptr,
            'surname': surname,
            'firstname': firstname,
            'birth': year,
            'place': geo_info.get(
                'place_geoname', ''
            ),  # 1er champ : issu de GeoNames
            'place_orig': place_gedcom,  # 2eme champ : brut issu du GEDCOM
            'lat': float(geo_info['lat']),
            'lon': float(geo_info['lon']),
            'deceased': deceased,
            'death_year': death_year,
        })
        valid_ids.add(ptr)
      else:
        nodes.append({
            'id': ptr,
            'surname': surname,
            'firstname': firstname,
            'birth': year,
            'place': '',  # Pas de correspondance GeoNames
            'place_orig': place_gedcom,  # Brut issu du GEDCOM
            'deceased': deceased,
            'death_year': death_year,
        })
        valid_ids.add(ptr)

  # 4. Créer les Liens (Mariages et Filiations)
  logging.info('--- Phase : Extraction des Relations FAM ---')
  for element in all_elements:
    if element.get_tag() == 'FAM':
      husb_ptr = None
      wife_ptr = None
      children_ptrs = []

      for sub in element.get_child_elements():
        tag = sub.get_tag()
        val = sub.get_value()
        if tag == 'HUSB':
          husb_ptr = val
        elif tag == 'WIFE':
          wife_ptr = val
        elif tag == 'CHIL':
          children_ptrs.append(val)

      # A. Liens de MARIAGE
      if husb_ptr in valid_ids and wife_ptr in valid_ids:
        links.append(
            {'source': husb_ptr, 'target': wife_ptr, 'type': 'marriage'}
        )

      # B. Liens de PARENTÉ (Naissance)
      for child_ptr in children_ptrs:
        if child_ptr in valid_ids:
          if husb_ptr and husb_ptr in valid_ids:
            links.append(
                {'source': husb_ptr, 'target': child_ptr, 'type': 'parent'}
            )
          if wife_ptr and wife_ptr in valid_ids:
            links.append(
                {'source': wife_ptr, 'target': child_ptr, 'type': 'parent'}
            )

  # 5. Export JSON
  with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {'nodes': nodes, 'links': links}, f, indent=2, ensure_ascii=False
    )

  print(
      f'Terminé : {len(nodes)} individus et {len(links)} relations (mariages +'
      ' naissances).'
  )


if __name__ == '__main__':
  main()