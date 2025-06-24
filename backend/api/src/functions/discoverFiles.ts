cat > src/functions/discoverFiles.ts << 'EOF'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import axios from "axios";

export async function discoverFiles(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Discovering files via Databricks SmartBDX');
    
    try {
        const databricksHost = process.env.DATABRICKS_HOST;
        const databricksToken = process.env.DATABRICKS_TOKEN;
        
        if (!databricksHost || !databricksToken) {
            return {
                status: 500,
                jsonBody: { error: "Databricks configuration missing" }
            };
        }

        // Simple approach: Use Databricks SQL to list files directly
        const response = await axios.post(`${databricksHost}/api/2.0/sql/statements`, {
            statement: `
                SELECT 
                    path as file_name,
                    size,
                    modification_time as last_modified
                FROM 
                    dbfs.\`/Volumes/test/bronze/raw/\`
                WHERE 
                    path LIKE '%.xlsx' OR path LIKE '%.xls'
                ORDER BY modification_time DESC
            `,
            warehouse_id: "auto"
        }, {
            headers: {
                'Authorization': `Bearer ${databricksToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Transform the results for frontend consumption
        const files = response.data.result?.data_array?.map((row: any[]) => ({
            id: row[0],
            file_name: row[0].split('/').pop(),
            size: row[1] || 0,
            last_modified: row[2] || new Date().toISOString(),
            status: "pending",
            sheets: 0
        })) || [];

        return {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            jsonBody: { files }
        };

    } catch (error) {
        context.error(`Discovery error: ${error.message}`);
        
        const fallbackFiles = [
            {
                id: "sample1.xlsx",
                file_name: "sample1.xlsx", 
                size: 1024000,
                last_modified: new Date().toISOString(),
                status: "pending",
                sheets: 3
            }
        ];

        return {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: { 
                files: fallbackFiles,
                note: "Using fallback data - Databricks connection issue",
                error: error.message
            }
        };
    }
}

app.http('discoverFiles', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: discoverFiles
});
EOF