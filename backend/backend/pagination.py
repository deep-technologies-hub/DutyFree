from rest_framework.pagination import PageNumberPagination


class Pagination(PageNumberPagination):
    """50 par page ; ?page_size= jusqu'à 1000 pour les exports."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000
