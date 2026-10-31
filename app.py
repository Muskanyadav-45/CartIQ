
import streamlit as st
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

st.set_page_config(
    page_title="CartIQ | Shopping Analytics",
    page_icon="🛒",
    layout="wide"
)

st.markdown("""
<style>
.stApp {
    background-color: #f4f7fc;
}
.block-container {
    padding-top: 2rem;
}
.welcome {
    background: linear-gradient(120deg, #172554, #4f46e5);
    padding: 30px;
    border-radius: 20px;
    color: white;
    margin-bottom: 25px;
}
.welcome h1 {
    color: white;
    font-size: 34px;
}
.welcome p {
    color: #e0e7ff;
    font-size: 16px;
}
div[data-testid="stMetric"] {
    background: white;
    padding: 18px;
    border-radius: 15px;
    border: 1px solid #e5e7eb;
}
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="welcome">
    <h1>Welcome back, Muskan! 👋</h1>
    <p>Your CartIQ customer insights dashboard is ready.</p>
    <p>Explore shopping patterns, customer segments and analytics.</p>
</div>
""", unsafe_allow_html=True)


st.markdown("""
<style>
.stApp {
    background-color: #f5f8fc;
}
.block-container {
    padding-top: 1.5rem;
}
.hero {
    padding: 25px;
    border-radius: 15px;
    background: linear-gradient(120deg, #102a43, #176b87);
    color: white;
}
.hero h1 {
    margin: 0;
    font-size: 42px;
}
.hero p {
    font-size: 17px;
}
div[data-testid="stMetric"] {
    background: white;
    border: 1px solid #e1e8ef;
    padding: 15px;
    border-radius: 12px;
}
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="hero">
    <h1>🛒 CartIQ</h1>
    <p>Intelligent Customer Segmentation & Shopping Analytics System</p>
</div>
""", unsafe_allow_html=True)

st.write(
    "Understand customer behaviour, discover shopping patterns, "
    "and group similar customers using machine learning."
)


# SIDEBAR
with st.sidebar:
    st.title("⚙️ CartIQ Settings")

    uploaded_file = st.file_uploader(
        "Upload Customer Dataset",
        type=["csv", "tsv", "txt"]
    )

    n_clusters = st.slider(
        "Number of Customer Segments",
        min_value=2,
        max_value=8,
        value=4
    )

    st.divider()
    st.caption("CartIQ | Customer Analytics")


# LOAD DATASET
@st.cache_data
def load_dataset(file_bytes=None):
    import io
    import os

    if file_bytes is not None:
        try:
            return pd.read_csv(
                io.BytesIO(file_bytes),
                sep=None,
                engine="python"
            )
        except Exception:
            return pd.read_csv(io.BytesIO(file_bytes))

    possible_files = [
        "marketing_campaign.csv",
        "marketing_campaign.csv.csv",
        "data.csv",
        "dataset.csv"
    ]

    for file_name in possible_files:
        if os.path.exists(file_name):
            try:
                data = pd.read_csv(file_name, sep=None, engine="python")

                if len(data.columns) <= 2:
                    data = pd.read_csv(file_name, sep="\t")

                return data
            except Exception:
                continue

    return None


df = load_dataset(
    uploaded_file.getvalue() if uploaded_file else None
)

if df is None:
    st.warning("Dataset not found!")

    st.info(
        "Upload your customer dataset using the left sidebar. "
        "Alternatively, place marketing_campaign.csv in the same "
        "folder as app.py."
    )

    st.stop()


# DATA PREPARATION
df.columns = [str(column).strip() for column in df.columns]
df = df.dropna(axis=1, how="all")

if "Year_Birth" in df.columns:
    df["Age"] = 2026 - pd.to_numeric(
        df["Year_Birth"], errors="coerce"
    )

if "Dt_Customer" in df.columns:
    dates = pd.to_datetime(
        df["Dt_Customer"],
        errors="coerce",
        dayfirst=True
    )

    if dates.notna().any():
        df["Customer_Tenure_Days"] = (
            dates.max() - dates
        ).dt.days

numeric_cols = df.select_dtypes(
    include=np.number
).columns.tolist()

categorical_cols = df.select_dtypes(
    exclude=np.number
).columns.tolist()

spending_cols = [
    col for col in numeric_cols
    if col.lower().startswith("mnt")
    or "spend" in col.lower()
    or "purchase" in col.lower()
]

demographic_cols = [
    col for col in [
        "Income", "Age", "Year_Birth",
        "Kidhome", "Teenhome", "Recency"
    ]
    if col in numeric_cols
]

st.sidebar.success(f"{len(df):,} records loaded")


# NAVIGATION
page = st.sidebar.radio(
    "Navigate Dashboard",
    [
        "Overview",
        "Dataset Explorer",
        "Shopping Analytics",
        "Customer Segmentation",
        "PCA Visualization"
    ]
)


# 1. OVERVIEW
if page == "Overview":

    st.subheader("📊 Project Overview")

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Total Records", f"{len(df):,}")
    col2.metric("Total Features", f"{df.shape[1]:,}")
    col3.metric("Numeric Features", len(numeric_cols))
    col4.metric(
        "Missing Values",
        f"{int(df.isna().sum().sum()):,}"
    )

    st.markdown("### Dataset Preview")
    st.dataframe(df.head(10), use_container_width=True)

    left, right = st.columns(2)

    with left:
        st.markdown("### Missing Values")

        missing = df.isna().sum()
        missing = missing[missing > 0].sort_values(
            ascending=False
        ).head(10)

        if len(missing):
            st.bar_chart(missing)
        else:
            st.success("No missing values found.")

    with right:
        st.markdown("### Feature Types")

        feature_types = pd.Series({
            "Numeric": len(numeric_cols),
            "Categorical": len(categorical_cols)
        })

        st.bar_chart(feature_types)

    st.info(
        "CartIQ converts customer data into useful insights "
        "to support better customer-focused decisions."
    )


# 2. DATASET EXPLORER
elif page == "Dataset Explorer":

    st.subheader("🔎 Dataset Explorer")

    selected_columns = st.multiselect(
        "Select columns to display",
        options=list(df.columns),
        default=list(df.columns[:min(8, len(df.columns))])
    )

    search_text = st.text_input("Search in dataset")

    if selected_columns:
        view = df[selected_columns].copy()
    else:
        view = df.copy()

    if search_text and len(view.columns):
        mask = view.astype(str).apply(
            lambda col: col.str.contains(
                search_text,
                case=False,
                na=False
            )
        ).any(axis=1)

        view = view[mask]

    st.write(f"Records displayed: {len(view):,}")

    st.dataframe(
        view,
        use_container_width=True,
        height=400
    )

    st.markdown("### Statistical Summary")

    if numeric_cols:
        st.dataframe(
            df[numeric_cols].describe().T,
            use_container_width=True
        )
    else:
        st.info("No numeric columns found.")


# 3. SHOPPING ANALYTICS
elif page == "Shopping Analytics":

    st.subheader("🛍️ Shopping Analytics")

    if not numeric_cols:
        st.warning("No numeric features available.")
        st.stop()

    choices = spending_cols if spending_cols else numeric_cols

    selected_feature = st.selectbox(
        "Select a feature",
        choices
    )

    values = pd.to_numeric(
        df[selected_feature],
        errors="coerce"
    ).dropna()

    left, right = st.columns(2)

    with left:
        st.markdown(f"### Distribution of {selected_feature}")

        fig, ax = plt.subplots(figsize=(7, 4))
        ax.hist(values, bins=20, edgecolor="white")
        ax.set_xlabel(selected_feature)
        ax.set_ylabel("Number of Records")
        ax.set_title("Feature Distribution")

        st.pyplot(fig)
        plt.close(fig)

    with right:
        st.markdown(f"### Summary Statistics")

        st.metric(
            "Average Value",
            f"{values.mean():,.2f}"
        )

        st.metric(
            "Highest Value",
            f"{values.max():,.2f}"
        )

        st.metric(
            "Lowest Value",
            f"{values.min():,.2f}"
        )

    if spending_cols:
        st.markdown("### Spending by Category")

        spending_summary = (
            df[spending_cols]
            .apply(pd.to_numeric, errors="coerce")
            .sum()
            .sort_values(ascending=False)
        )

        st.bar_chart(spending_summary)

    if len(numeric_cols) >= 2:
        st.markdown("### Feature Relationship")

        x_feature = st.selectbox(
            "X-axis",
            numeric_cols,
            key="x_feature"
        )

        y_feature = st.selectbox(
            "Y-axis",
            numeric_cols,
            index=min(1, len(numeric_cols) - 1),
            key="y_feature"
        )

        plot_data = df[
            [x_feature, y_feature]
        ].apply(pd.to_numeric, errors="coerce").dropna()

        st.scatter_chart(
            plot_data,
            x=x_feature,
            y=y_feature
        )


# 4. CUSTOMER SEGMENTATION
elif page == "Customer Segmentation":

    st.subheader("👥 Customer Segmentation")

    st.write(
        "K-Means clustering groups customers with similar "
        "characteristics into different segments."
    )

    default_features = [
        col for col in spending_cols + demographic_cols
        if col in numeric_cols
    ]

    if len(default_features) < 2:
        default_features = numeric_cols[:min(5, len(numeric_cols))]

    selected_features = st.multiselect(
        "Select features for clustering",
        numeric_cols,
        default=default_features[:min(8, len(default_features))]
    )

    if len(selected_features) < 2:
        st.warning("Select at least two numeric features.")

    elif len(df) < n_clusters:
        st.warning("There are not enough records for this number of segments.")

    else:
        model_data = df[selected_features].copy()

        model_data = model_data.replace(
            [np.inf, -np.inf], np.nan
        )

        model_data = model_data.fillna(
            model_data.median()
        ).fillna(0)

        scaler = StandardScaler()
        scaled_data = scaler.fit_transform(model_data)

        model = KMeans(
            n_clusters=n_clusters,
            random_state=42,
            n_init=10
        )

        labels = model.fit_predict(scaled_data)

        result = df.copy()
        result["Customer_Segment"] = labels + 1

        counts = result[
            "Customer_Segment"
        ].value_counts().sort_index()

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("### Customers per Segment")
            st.bar_chart(counts)

        with col2:
            st.markdown("### Segment Profile")

            summary = result.groupby(
                "Customer_Segment"
            )[selected_features].mean().round(2)

            st.dataframe(
                summary,
                use_container_width=True
            )

        st.markdown("### Segmented Dataset")

        st.dataframe(
            result,
            use_container_width=True,
            height=350
        )

        csv_data = result.to_csv(
            index=False
        ).encode("utf-8")

        st.download_button(
            "⬇️ Download Segmented Dataset",
            data=csv_data,
            file_name="cartiq_customer_segments.csv",
            mime="text/csv"
        )

        st.success(
            f"K-Means created {n_clusters} segments "
            f"using {len(selected_features)} features."
        )

        st.caption(
            "Segment numbers identify groups; they do not represent rankings."
        )


# 5. PCA VISUALIZATION
elif page == "PCA Visualization":

    st.subheader("🧭 PCA Visualization")

    st.write(
        "Principal Component Analysis (PCA) reduces multiple "
        "numeric features to two dimensions for visualization."
    )

    selected_features = st.multiselect(
        "Select features for PCA",
        numeric_cols,
        default=numeric_cols[:min(8, len(numeric_cols))]
    )

    if len(selected_features) < 2:
        st.warning("Select at least two numeric features.")

    else:
        pca_data = df[selected_features].copy()

        pca_data = pca_data.replace(
            [np.inf, -np.inf], np.nan
        )

        pca_data = pca_data.fillna(
            pca_data.median()
        ).fillna(0)

        if len(pca_data) < 2:
            st.warning("At least two records are required for PCA.")
        else:
            scaled_data = StandardScaler().fit_transform(
                pca_data
            )

            pca = PCA(
                n_components=2,
                random_state=42
            )

            coordinates = pca.fit_transform(scaled_data)

            pca_df = pd.DataFrame(
                coordinates,
                columns=[
                    "Principal Component 1",
                    "Principal Component 2"
                ]
            )

            variance = (
                pca.explained_variance_ratio_.sum() * 100
            )

            st.metric(
                "Variance Explained by 2 Components",
                f"{variance:.1f}%"
            )

            if len(pca_df) > 5000:
                pca_df = pca_df.sample(
                    5000,
                    random_state=42
                )

                st.caption(
                    "Showing 5,000 sampled records for faster visualization."
                )

            st.scatter_chart(
                pca_df,
                x="Principal Component 1",
                y="Principal Component 2"
            )

            st.caption(
                "Each point represents a record. Nearby points have "
                "similar patterns across the selected features."
            )


# FOOTER
st.divider()

st.caption(
    "CartIQ | Intelligent Customer Segmentation & Shopping Analytics System"
)
