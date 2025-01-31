import pyodbc
import csv
from datetime import datetime

def clean_number(value):
    """Convert Informix number format to integer"""
    if isinstance(value, str):
        # Remove decimal point and trailing zeros
        return int(value.replace('.000', ''))
    return int(value)

def get_location_details(cursor, diff_articles):
    """Get detailed location information for articles with differences"""
    location_details = []
    
    for article_id in diff_articles:
        # Query to get locations and quantities for each article
        location_query = """
            SELECT 
                id_art,
                area,
                scaffale,
                colonna,
                piano,
                SUM(qta) as total_quantity
            FROM wms_items
            WHERE id_art = ?
            GROUP BY id_art, area, scaffale, colonna, piano
        """
        cursor.execute(location_query, (article_id,))
        locations = cursor.fetchall()
        
        for loc in locations:
            location_details.append({
                'Article_ID': loc[0],
                'Area': loc[1],
                'Scaffale': loc[2],
                'Colonna': loc[3],
                'Piano': loc[4],
                'Quantity': clean_number(loc[5]),
                'Location': f"{loc[1]}-{loc[2]}-{loc[3]}-{loc[4]}"
            })
    
    return location_details

def check_quantity_differences():
    try:
        # Use your existing connection method
        connection = pyodbc.connect('DSN=fec;UID=informix;PWD=informix;')
        cursor = connection.cursor()

        # [Previous code remains the same until after creating the first CSV]
        
        # First get all distinct id_art and their quantities from wms_items
        wms_query = """
            SELECT id_art, SUM(qta) as total_quantity
            FROM wms_items
            GROUP BY id_art
        """
        cursor.execute(wms_query)
        wms_items = cursor.fetchall()

        # Check each item against the other calculation
        differences = []
        for item in wms_items:
            id_art, wms_quantity = item
            wms_quantity = clean_number(wms_quantity)
            
            comparison_query = """
                SELECT m.dep_qcar - m.dep_qsca, m.dep_arti, g.amg_dest
                FROM mgdepo m 
                INNER JOIN mganag g ON (m.dep_arti = g.amg_code)
                WHERE m.dep_arti = ? AND m.dep_code = '1'
            """
            cursor.execute(comparison_query, (id_art,))
            result = cursor.fetchone()

            if result:
                calculated_qty = clean_number(result[0])
                if calculated_qty != wms_quantity:
                    differences.append({
                        'Article_ID': id_art,
                        'WMS_Quantity': wms_quantity,
                        'Calculated_Quantity': calculated_qty,
                        'AMG_Destination': result[2],
                        'Difference': calculated_qty - wms_quantity,
                        'Fatto':None
                    })

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if differences:
            # Save differences to first CSV
            diff_filename = f'quantity_differences_{timestamp}.csv'
            fieldnames = differences[0].keys()
            
            with open(diff_filename, 'w', newline='') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(differences)
            
            print(f"\nDifferences saved to CSV: {diff_filename}")
            
            # Get and save location details for articles with differences
            diff_articles = [d['Article_ID'] for d in differences]
            location_details = get_location_details(cursor, diff_articles)
            
            if location_details:
                loc_filename = f'location_details_{timestamp}.csv'
                loc_fieldnames = location_details[0].keys()
                
                with open(loc_filename, 'w', newline='') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=loc_fieldnames)
                    writer.writeheader()
                    writer.writerows(location_details)
                
                print(f"Location details saved to CSV: {loc_filename}")
                print(f"\nFound {len(differences)} articles with differences")
                print(f"Generated {len(location_details)} location records")
                
                # Print sample of location details (first 5)
                print("\nSample of location details:")
                for i, loc in enumerate(location_details[:5]):
                    print(f"\nLocation {i+1}:")
                    for key, value in loc.items():
                        print(f"{key}: {value}")
        else:
            print("\nNo differences found.")

    except pyodbc.Error as error:
        print("Error while connecting to database:", str(error))
    except Exception as e:
        print("Error occurred:", str(e))
    
    finally:
        if connection:
            cursor.close()
            connection.close()
            print("\nDatabase connection closed.")

if __name__ == "__main__":
    check_quantity_differences()