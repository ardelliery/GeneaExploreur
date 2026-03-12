import json
import re
import csv
import logging
from gedcom.element.individual import IndividualElement
from gedcom.parser import Parser

# Configuration du LOG
logging.basicConfig(filename='final_data_production.log', level=logging.INFO, 
                    format='%(levelname)s: %(message)s', filemode='w', encoding='utf-8')

GEDCOM_FILE = 'LoicMarion.ged'
PLACES_CSV = 'liste_lieux_complet.csv'
OUTPUT_FILE = 'data.json'

def get_year(date_str):
    if not date_str: return None
    match = re.search(r'\d{4}', date_str)
    return int(match.group()) if match else None

def main():
    # 1. Charger le référentiel géographique
    geo_ref = {}
    try:
        with open(PLACES_CSV, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get('lat') and row.get('lon'):
                    geo_ref[row['place']] = row
    except FileNotFoundError:
        print(f"Erreur : {PLACES_CSV} introuvable.")
        return

    # 2. Parser le GEDCOM
    gedcom_parser = Parser()
    gedcom_parser.parse_file(GEDCOM_FILE)
    all_elements = gedcom_parser.get_element_list()
    
    nodes = []
    links = []
    valid_ids = set()

    # 3. Créer les Nœuds (Individus valides)
    for element in all_elements:
        if isinstance(element, IndividualElement):
            ptr = element.get_pointer()
            birth = element.get_birth_data()
            year = get_year(birth[0]) if birth else None
            if year is None: 
                year=0
            place = birth[1].strip() if birth and birth[1] else None
            logging.info(f">>> traite {ptr}, year={year}, place={place}")
            deceased = 0
            if element.is_deceased():
              deceased = 1
              death_year = element.get_death_year()
            else: 
              deceased = 0
              death_year = 0

            
            if place in geo_ref:
                name = element.get_name()
                nodes.append({
                    "id": ptr,
                    "surname": name[1].replace('/', '') if len(name) > 1 else "Inconnu",
                    "firstname": name[0] if len(name) > 0 else "",
                    "birth": year,
                    "place": place,
                    "lat": float(geo_ref[place]['lat']),
                    "lon": float(geo_ref[place]['lon']),
                    "deceased": deceased,
                    "death_year": death_year
                })
                valid_ids.add(ptr)
            else:
                name = element.get_name()
                nodes.append({
                    "id": ptr,
                    "surname": name[1].replace('/', '') if len(name) > 1 else "Inconnu",
                    "firstname": name[0] if len(name) > 0 else "",
                    "birth": year,
                    "place": "",
                    "deceased": deceased,
                    "death_year": death_year
                })
                valid_ids.add(ptr)

    # 4. Créer les Liens (En parcourant les familles FAM)
    logging.info("--- Phase : Extraction des Relations FAM ---")
    for element in all_elements:
        if element.get_tag() == 'FAM':
            husb_ptr = None
            wife_ptr = None
            children_ptrs = []

            # Analyse des membres de la famille
            for sub in element.get_child_elements():
                tag = sub.get_tag()
                val = sub.get_value()
                if tag == 'HUSB': husb_ptr = val
                elif tag == 'WIFE': wife_ptr = val
                elif tag == 'CHIL': children_ptrs.append(val)
            
            # A. Création des liens de MARIAGE
            if husb_ptr in valid_ids and wife_ptr in valid_ids:
                links.append({"source": husb_ptr, "target": wife_ptr, "type": "marriage"})
            
            # B. Création des liens de PARENTÉ (Naissance)
            # On relie chaque parent à chaque enfant si les deux sont sur la carte
            for child_ptr in children_ptrs:
                if child_ptr in valid_ids:
                    # Lien Père -> Enfant
                    if husb_ptr and husb_ptr in valid_ids:
                        links.append({"source": husb_ptr, "target": child_ptr, "type": "parent"})
                    # Lien Mère -> Enfant
                    if wife_ptr and wife_ptr in valid_ids:
                        links.append({"source": wife_ptr, "target": child_ptr, "type": "parent"})
                else:
                    logging.info(f"LIEN SAUTÉ : L'enfant {child_ptr} n'a pas de coordonnées valides.")

    # 5. Export JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({"nodes": nodes, "links": links}, f, indent=2, ensure_ascii=False)
    
    print(f"Terminé : {len(nodes)} individus et {len(links)} relations (mariages + naissances).")

if __name__ == "__main__":
    main()