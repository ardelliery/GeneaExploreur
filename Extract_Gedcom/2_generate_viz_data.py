"""Module de génération du fichier de données JSON pour la visualisation.

Ce script croise les informations des individus et familles extraites du fichier
GEDCOM avec le référentiel géographique géolocalisé pour produire le fichier
JSON complet (data.json) contenant les nœuds et les liens.

Prise en compte des nouveaux champs dans nodes :
- "place" : place_geoname (1er champ de liste_lieux_complet.csv)
- "place_orig" : place GEDCOM (2eme champ de liste_lieux_complet.csv)
- "dept" : département (champ dept de liste_lieux_complet.csv)
- "insee" : code INSEE ou identifiant (champ insee de liste_lieux_complet.csv)
"""

import csv
import json
import logging
import re
from gedcom.element.individual import IndividualElement
from gedcom.parser import Parser

logging.basicConfig(
    filename='final_data_production.log',
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    filemode='w',
    encoding='utf-8',
)

GEDCOM_FILE = 'LoicMarion.ged'
PLACES_CSV = 'liste_lieux_complet.csv'
OUTPUT_FILE = 'data.json'


def get_year(date_str):
  if not date_str:
    return None
  match = re.search(r'\d{4}', date_str)
  return int(match.group()) if match else None


def main():
  geo_ref = {}
  try:
    with open(PLACES_CSV, 'r', encoding='utf-8') as f:
      reader = csv.DictReader(f)
      for row in reader:
        place_key = row.get('place', '').strip()
        lat = row.get('lat', '').strip()
        lon = row.get('lon', '').strip()

        if place_key and lat and lon:
          geo_ref[place_key] = row
  except FileNotFoundError:
    print(f'Erreur : {PLACES_CSV} introuvable.')
    return

  gedcom_parser = Parser()
  gedcom_parser.parse_file(GEDCOM_FILE)
  all_elements = gedcom_parser.get_element_list()

  nodes = []
  links = []
  valid_ids = set()

  for element in all_elements:
    if isinstance(element, IndividualElement):
      ptr = element.get_pointer()
      birth = element.get_birth_data()
      year = get_year(birth[0]) if birth else None
      if year is None:
        year = 0
      place_gedcom = birth[1].strip() if birth and birth[1] else ''

      deceased = 0
      death_year = 0
      if element.is_deceased():
        deceased = 1
        death_year = element.get_death_year() or 0

      name = element.get_name()
      surname = name[1].replace('/', '') if len(name) > 1 else 'Inconnu'
      firstname = name[0] if len(name) > 0 else ''

      # S'IL Y A UNE CORRESPONDANCE DANS GEONAMES
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
            'place_orig': place_gedcom,  # 2eme champ : brut GEDCOM
            'dept': geo_info.get(
                'dept', ''
            ),  # NOUVEAU : Récupération du département
            'insee': geo_info.get(
                'insee', ''
            ),  # NOUVEAU : Récupération du code INSEE / No commune
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
            'place': '',
            'place_orig': place_gedcom,
            'dept': '',  # NOUVEAU : Vide si non géolocalisé
            'insee': '',  # NOUVEAU : Vide si non géolocalisé
            'deceased': deceased,
            'death_year': death_year,
        })
        valid_ids.add(ptr)

  # Liens FAM
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

      if husb_ptr in valid_ids and wife_ptr in valid_ids:
        links.append(
            {'source': husb_ptr, 'target': wife_ptr, 'type': 'marriage'}
        )

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

  with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {'nodes': nodes, 'links': links}, f, indent=2, ensure_ascii=False
    )

  print(f'Nouveau fichier {OUTPUT_FILE} généré avec dept et insee.')


if __name__ == '__main__':
  main()