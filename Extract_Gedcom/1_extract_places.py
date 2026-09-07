"""
Module d'extraction des lieux depuis un fichier GEDCOM.

Ce script parcourt un fichier GEDCOM, vérifie la présence des dates et lieux
de naissance pour chaque individu (avec journalisation des anomalies dans un fichier de log),
et génère un fichier CSV contenant la liste des lieux uniques.
"""

import csv
import logging
from gedcom.element.individual import IndividualElement
from gedcom.parser import Parser

# Configuration du système de journalisation (LOG)
# Écrit les messages d'information et d'avertissement dans 'audit_gedcom.log'
logging.basicConfig(filename='audit_gedcom.log', level=logging.INFO, 
                    format='%(levelname)s: %(message)s', filemode='w', encoding='utf-8')

# Fichiers d'entrée et de sortie
GEDCOM_FILE = 'LoicMarion.ged'
PLACES_OUTPUT = 'liste_lieux.csv'

def main():
    """
    Fonction principale d'extraction et d'audit des lieux du fichier GEDCOM.

    Lit le fichier GEDCOM configuré via :const:`GEDCOM_FILE`, audite la présence
    des dates et lieux de naissance des individus, et enregistre la liste
    des lieux uniques triés dans :const:`PLACES_OUTPUT`.

    :returns: None
    """
    # Initialisation du parser GEDCOM
    gedcom_parser = Parser()
    
    # Chargement et analyse de la structure du fichier GEDCOM
    gedcom_parser.parse_file(GEDCOM_FILE)
    
    # Ensemble (set) pour stocker les lieux uniques sans doublons
    unique_places = set()
    
    logging.info("Démarrage de l'audit du fichier GEDCOM")
    
    # Parcours de tous les éléments extraits du fichier GEDCOM
    for element in gedcom_parser.get_element_list():
        # Traitement ciblé sur les éléments de type individu (IndividualElement)
        if isinstance(element, IndividualElement):
            # Formate le nom complet de l'individu pour l'affichage dans les logs
            name = " ".join(element.get_name())
            
            # Identifiant unique de l'individu dans le fichier GEDCOM (ex: '@I1@')
            ptr = element.get_pointer()
            
            # Récupère les données de naissance : tuple (date, lieu) ou None
            birth_data = element.get_birth_data()
            
            # Vérification de la présence de la date de naissance (1er élément du tuple)
            if not birth_data or not birth_data[0]:
                logging.warning(f"Individu {ptr} ({name}) : Date de naissance absente.")
            
            # Vérification de la présence du lieu de naissance (2e élément du tuple)
            if not birth_data or not birth_data[1]:
                logging.warning(f"Individu {ptr} ({name}) : Lieu de naissance absent.")
            else:
                # Ajout du lieu nettoyé des espaces inutiles dans le set d'unicité
                unique_places.add(birth_data[1].strip())

    # Export des lieux uniques vers le fichier CSV de sortie
    # Les colonnes lat et lon sont laissées vides pour être complétées ultérieurement
    with open(PLACES_OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        # Écriture de l'en-tête CSV
        writer.writerow(['place', 'lat', 'lon'])
        
        # Écriture de chaque lieu unique, trié par ordre alphabétique
        for p in sorted(list(unique_places)):
            writer.writerow([p, '', ''])
            
    logging.info(f"Extraction terminée. {len(unique_places)} lieux uniques exportés.")
    print("Audit terminé. Consultez 'audit_gedcom.log' pour les anomalies.")

if __name__ == "__main__":
    main()
