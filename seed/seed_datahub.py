"""Add owners, domain, tags, glossary terms and lineage to the retail_demo datasets.

Run after `datahub ingest -c seed/postgres_recipe.yml`. Every entity created here
is namespaced (retail_demo*) and recorded in seed/manifest.json so cleanup.py
removes exactly these and nothing else. Existing DataHub metadata is not touched.

The lineage mirrors the real SQL in infra/airflow/dags/retail_analytics_pipeline.py:
transform_revenue reads raw.orders + raw.products and writes analytics.daily_revenue.
"""

import json
import os
from pathlib import Path

from datahub.emitter.mce_builder import make_dataset_urn
from datahub.emitter.mcp import MetadataChangeProposalWrapper
from datahub.emitter.rest_emitter import DatahubRestEmitter
from datahub.metadata.schema_classes import (
    AuditStampClass,
    CorpGroupInfoClass,
    DatasetLineageTypeClass,
    DomainPropertiesClass,
    DomainsClass,
    EditableDatasetPropertiesClass,
    EditableSchemaFieldInfoClass,
    EditableSchemaMetadataClass,
    GlobalTagsClass,
    GlossaryNodeInfoClass,
    GlossaryTermAssociationClass,
    GlossaryTermInfoClass,
    GlossaryTermsClass,
    OwnerClass,
    OwnershipClass,
    OwnershipTypeClass,
    TagAssociationClass,
    TagPropertiesClass,
    UpstreamClass,
    UpstreamLineageClass,
)

HERE = Path(__file__).resolve().parent
AUDIT = AuditStampClass(time=0, actor="urn:li:corpuser:datahub")


def ds(name: str) -> str:
    return make_dataset_urn("postgres", f"retail_demo.{name}", "PROD")


ORDERS, CUSTOMERS, PRODUCTS, REVENUE = (
    ds("raw.orders"),
    ds("raw.customers"),
    ds("raw.products"),
    ds("analytics.daily_revenue"),
)
DOMAIN = "urn:li:domain:retail_demo"
REVENUE_TEAM = "urn:li:corpGroup:retail_demo_revenue_analytics"
PLATFORM_TEAM = "urn:li:corpGroup:retail_demo_data_platform"
TAG_PII = "urn:li:tag:retail_demo_pii"
TAG_FINANCE = "urn:li:tag:retail_demo_finance"
TERM_NODE = "urn:li:glossaryNode:retail_demo"
TERM_REVENUE = "urn:li:glossaryTerm:retail_demo.revenue"
TERM_CUSTOMER = "urn:li:glossaryTerm:retail_demo.customer"


def owners(*groups: tuple[str, str]) -> OwnershipClass:
    return OwnershipClass(owners=[OwnerClass(owner=g, type=t) for g, t in groups])


def tags(*urns: str) -> GlobalTagsClass:
    return GlobalTagsClass(tags=[TagAssociationClass(tag=u) for u in urns])


def terms(*urns: str) -> GlossaryTermsClass:
    return GlossaryTermsClass(
        terms=[GlossaryTermAssociationClass(urn=u) for u in urns], auditStamp=AUDIT
    )


def proposals() -> list[MetadataChangeProposalWrapper]:
    mcps = [
        (DOMAIN, DomainPropertiesClass(name="Retail Demo", description="Lab retail warehouse.")),
        (REVENUE_TEAM, CorpGroupInfoClass(displayName="Revenue Analytics", admins=[], members=[], groups=[])),
        (PLATFORM_TEAM, CorpGroupInfoClass(displayName="Data Platform", admins=[], members=[], groups=[])),
        (TAG_PII, TagPropertiesClass(name="retail_demo.pii", description="Holds personal data.")),
        (TAG_FINANCE, TagPropertiesClass(name="retail_demo.finance", description="Finance reporting.")),
        (TERM_NODE, GlossaryNodeInfoClass(name="Retail Demo", definition="Lab glossary.")),
        (TERM_REVENUE, GlossaryTermInfoClass(
            name="Revenue", definition="Quantity x unit price of completed orders.",
            termSource="INTERNAL", parentNode=TERM_NODE)),
        (TERM_CUSTOMER, GlossaryTermInfoClass(
            name="Customer", definition="A person who placed at least one order.",
            termSource="INTERNAL", parentNode=TERM_NODE)),
        # raw.orders
        (ORDERS, EditableDatasetPropertiesClass(description="One row per order line from the shop.")),
        (ORDERS, owners((PLATFORM_TEAM, OwnershipTypeClass.TECHNICAL_OWNER))),
        (ORDERS, DomainsClass(domains=[DOMAIN])),
        # raw.customers: the PII dataset
        (CUSTOMERS, EditableDatasetPropertiesClass(description="Customer master data.")),
        (CUSTOMERS, owners((PLATFORM_TEAM, OwnershipTypeClass.TECHNICAL_OWNER))),
        (CUSTOMERS, DomainsClass(domains=[DOMAIN])),
        (CUSTOMERS, tags(TAG_PII)),
        (CUSTOMERS, terms(TERM_CUSTOMER)),
        (CUSTOMERS, EditableSchemaMetadataClass(
            created=AUDIT,
            editableSchemaFieldInfo=[EditableSchemaFieldInfoClass(
                fieldPath="email", description="Customer contact address.", globalTags=tags(TAG_PII))],
        )),
        # raw.products is left without owner, description, tags or terms on
        # purpose: the "missing metadata" case.
        (PRODUCTS, DomainsClass(domains=[DOMAIN])),
        # analytics.daily_revenue
        (REVENUE, EditableDatasetPropertiesClass(
            description="Daily gross revenue per product category, built by Airflow.")),
        (REVENUE, owners((REVENUE_TEAM, OwnershipTypeClass.BUSINESS_OWNER),
                         (PLATFORM_TEAM, OwnershipTypeClass.TECHNICAL_OWNER))),
        (REVENUE, DomainsClass(domains=[DOMAIN])),
        (REVENUE, tags(TAG_FINANCE)),
        (REVENUE, terms(TERM_REVENUE)),
        (REVENUE, UpstreamLineageClass(upstreams=[
            UpstreamClass(dataset=ORDERS, type=DatasetLineageTypeClass.TRANSFORMED),
            UpstreamClass(dataset=PRODUCTS, type=DatasetLineageTypeClass.TRANSFORMED),
        ])),
    ]
    return [MetadataChangeProposalWrapper(entityUrn=u, aspect=a) for u, a in mcps]


def main() -> None:
    emitter = DatahubRestEmitter(
        os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080"),
        token=os.environ["DATAHUB_GMS_TOKEN"],
    )
    emitter.test_connection()
    created = []
    for mcp in proposals():
        emitter.emit(mcp)
        if mcp.entityUrn not in created:
            created.append(mcp.entityUrn)
    (HERE / "manifest.json").write_text(json.dumps({"urns": created}, indent=2), encoding="utf-8")
    print(f"Emitted {len(proposals())} aspects across {len(created)} entities; see seed/manifest.json")


if __name__ == "__main__":
    main()
