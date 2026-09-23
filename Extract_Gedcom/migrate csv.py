import csv
import os

INPUT_CSV = 'liste_lieux_complet.csv'
TEMP_CSV = 'liste_lieux_complet_migrated.csv'

# Colonnes cibles souhaitées
FIELDNAMES = ['place', 'geoname_name', 'insee', 'dept', 'lat', 'lon']

def migrate_csv():
    if not os.path.exists(INPUT_CSV):
        print(f"{INPUT_CSV} n'existe pas encore.")
        return

    with open(INPUT_CSV, 'r', encoding='utf-8') as fin, \
         open(TEMP_CSV, 'w', encoding='utf-8', newline='') as fout:
        
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=FIELDNAMES)
        writer.writeheader()

        for row in reader:
            # On s'assure que geoname_name existe (s'il n'existait pas, on met la valeur de place par défaut)
            new_row = {
                'place': row.get('place', ''),
                'geoname_name': row.get('geoname_name', row.get('place', '')),
                'insee': row.get('insee', ''),
                'dept': row.get('dept', ''),
                'lat': row.get('lat', ''),
                'lon': row.get('lon', '')
            }
            writer.writerow(new_row)

    # Remplacement du fichier original par le fichier migré
    os.replace(TEMP_CSV, INPUT_CSV)
    print(f"Migration terminée. {INPUT_CSV} contient maintenant le champ 'geoname_name'.")

if __name__ == '__main__':
    migrate_csv()