"""
Module de recherche géographique en cascade avec la base GeoNames.

Ce script enrichit la liste des lieux extraits d'un fichier GEDCOM en recherchant
leurs coordonnées géographiques (latitude, longitude), code INSEE et département
dans les fichiers de référence GeoNames (ex: FR.txt, CH.txt) via une stratégie de recherche en cascade.
"""

import csv
import os
import logging

# Configuration du LOG pour suivre la cascade de recherche
logging.basicConfig(filename='recherche_geo_cascade.log', level=logging.INFO, 
                    format='%(levelname)s: %(message)s', filemode='w', encoding='utf-8')

INPUT_CSV = 'liste_lieux.csv'
OUTPUT_CSV = 'liste_lieux_complet.csv'
GEONAMES_FILES = ['FR.txt', 'CH.txt']

def load_geonames_to_dict(files):
    """
    Charge les fichiers de référence GeoNames dans un dictionnaire d'indexation optimisé.

    Parcourt la liste de fichiers texte au format tabulé GeoNames et associe
    chaque nom de localité (et son alternative ASCII) à ses métadonnées
    géographiques (coordonnées lat/lon, code INSEE, département).

    :param files: Liste des chemins vers les fichiers GeoNames de référence.
    :type files: list[str]
    :returns: Dictionnaire associant les noms de lieux nettoyés en minuscules
              à un dictionnaire contenant les clés 'lat', 'lon', 'insee' et 'dept'.
    :rtype: dict[str, dict[str, str]]
    """
    geo_data = {}
    print("Chargement des bases France et Suisse...")
    for filename in files:
        if not os.path.exists(filename):
            logging.error(f"Fichier référence manquant : {filename}")
            continue
            
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter='\t')
            for row in reader:
                # 1:name, 2:asciiname, 4:lat, 5:lon, 11:admin2 (Dept/Canton), 13:admin3 (INSEE)
                name = row[1].strip().lower()
                ascii_name = row[2].strip().lower()
                info = {
                    "lat": row[4], 
                    "lon": row[5], 
                    "insee": row[13], 
                    "dept": row[11]
                }
                
                for key in [name, ascii_name]:
                    if key not in geo_data:
                        geo_data[key] = info # On garde la première occurrence (souvent la ville principale)
    return geo_data

def main():
    """
    Fonction principale d'enrichissement géographique par recherche en cascade.

    Charge les données GeoNames, lit le fichier CSV des lieux d'entrée (:const:`INPUT_CSV`),
    exécute les différentes étapes de recherche en cascade (nom complet, 1re partie,
    2e partie de la chaîne) et exporte le résultat dans :const:`OUTPUT_CSV`.

    :returns: None
    """
    geo_index = load_geonames_to_dict(GEONAMES_FILES)
    results = []
    
    print("Traitement de la liste des lieux avec recherche en cascade...")
    with open(INPUT_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            place_full = row['place']
            parts = [p.strip().lower() for p in place_full.split(',')]
            
            match_found = None
            methode = ""

            # --- STRATÉGIE DE RECHERCHE EN CASCADE ---
            
            # 1. Tentative sur le nom complet (ex: "Petit-Bourg, Guadeloupe")
            if place_full.lower() in geo_index:
                match_found = geo_index[place_full.lower()]
                methode = "FULL_MATCH"

            # 2. Tentative sur le premier élément (ex: "Lieu-dit" ou "Commune")
            if not match_found and len(parts) >= 1:
                if parts[0] in geo_index:
                    match_found = geo_index[parts[0]]
                    methode = "PART_1_MATCH"

            # 3. Tentative sur le deuxième élément (ex: la commune si le 1er était un hameau)
            if not match_found and len(parts) >= 2:
                if parts[1] in geo_index:
                    match_found = geo_index[parts[1]]
                    methode = "PART_2_FALLBACK"

            if match_found:
                logging.info(f"SUCCÈS [{methode}] : '{place_full}' -> trouvé via '{match_found.get('insee')}'")
                results.append({
                    'place': place_full,
                    'lat': match_found['lat'],
                    'lon': match_found['lon'],
                    'insee': match_found['insee'],
                    'dept': match_found['dept']
                })
            else:
                logging.warning(f"ÉCHEC : Aucune correspondance pour '{place_full}'")
                results.append({'place': place_full, 'lat': '', 'lon': '', 'insee': '', 'dept': ''})

    # Sauvegarde
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['place', 'lat', 'lon', 'insee', 'dept']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)
        
    print(f"Traitement terminé. Résultats dans {OUTPUT_CSV}")
    print("Consultez 'recherche_geo_cascade.log' pour voir les détails des replis (fallback).")

if __name__ == "__main__":
    main()
