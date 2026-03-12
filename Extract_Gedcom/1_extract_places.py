import csv
import logging
from gedcom.element.individual import IndividualElement
from gedcom.parser import Parser

# Configuration du LOG
logging.basicConfig(filename='audit_gedcom.log', level=logging.INFO, 
                    format='%(levelname)s: %(message)s', filemode='w', encoding='utf-8')

GEDCOM_FILE = 'LoicMarion.ged'
PLACES_OUTPUT = 'liste_lieux.csv'

def main():
    gedcom_parser = Parser()
    gedcom_parser.parse_file(GEDCOM_FILE)
    unique_places = set()
    
    logging.info("Démarrage de l'audit du fichier GEDCOM")
    
    for element in gedcom_parser.get_element_list():
        if isinstance(element, IndividualElement):
            name = " ".join(element.get_name())
            ptr = element.get_pointer()
            birth_data = element.get_birth_data()
            
            # Vérification Date
            if not birth_data or not birth_data[0]:
                logging.warning(f"Individu {ptr} ({name}) : Date de naissance absente.")
            
            # Vérification Lieu
            if not birth_data or not birth_data[1]:
                logging.warning(f"Individu {ptr} ({name}) : Lieu de naissance absent.")
            else:
                unique_places.add(birth_data[1].strip())

    with open(PLACES_OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['place', 'lat', 'lon'])
        for p in sorted(list(unique_places)):
            writer.writerow([p, '', ''])
            
    logging.info(f"Extraction terminée. {len(unique_places)} lieux uniques exportés.")
    print("Audit terminé. Consultez 'audit_gedcom.log' pour les anomalies.")

if __name__ == "__main__":
    main()