import os
from openai import OpenAI
from django.conf import settings


from langchain_openai import AzureChatOpenAI

temperature = 0.3
model = AzureChatOpenAI(
    deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    temperature=temperature,
)


def pick_relevant_tables(user_query, schema):
    """Use LLM to pick only the relevant tables from the schema."""
    all_tables = sorted({t for t, c, d in schema})


    system_prompt = (
        "You are an assistant that selects only the database tables needed "
        "to answer a query.\n"
        f"Available tables: {', '.join(all_tables)}\n"
        "Return only table names separated by commas, no explanations."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_query}
    ]
    response = model.invoke(messages)
    # LangChain's model.invoke returns an AIMessage with .content
    picked = response.content if hasattr(response, 'content') else str(response)
    selected = [t.strip() for t in picked.split(",") if t.strip() in all_tables]
    if not selected:
        selected = all_tables[:2]  # fallback, never empty
    return selected


def generate_sql(user_query, schema):
    if not user_query:
        user_query = ""
    print(f"User query: {user_query}")

    # Step 1: Pick relevant tables
    relevant_tables = pick_relevant_tables(user_query, schema)

    # Step 2: Build schema string only with selected tables
    schema_str = "\n".join([
        f"{t}.{c} ({d})" for t, c, d in schema if t in relevant_tables
    ])

    # Step 3: Generate SQL with strict rules using LangChain AzureChatOpenAI
    messages = [
        {"role": "system", "content": (
            "You are a SQL generator for PostgreSQL.\n\n"
            f"Schema:\n{schema_str}\n\n"
            "Rules:\n"
            "- Use EXACTLY the table and column names as given in the schema.\n"
            "- Do not shorten, rename, or invent names.\n"
            "- Always fully qualify columns as table.column.\n"
            "- Only output SELECT queries.\n"
            "- Never guess column names. If unsure, pick only from schema."
        )},
        {"role": "user", "content": user_query}
    ]
    response = model.invoke(messages)
    sql_response = response.content.strip() if hasattr(response, 'content') else str(response).strip()

    # Step 4: Clean SQL (remove ``` markers)
    if sql_response.startswith("```sql") and sql_response.endswith("```"):
        sql_response = sql_response[6:-3].strip()
    elif sql_response.startswith("```") and sql_response.endswith("```"):
        sql_response = sql_response[3:-3].strip()

    print(f"Cleaned SQL response: {sql_response}")
    print(f"Tables used: {relevant_tables}")

    return sql_response

