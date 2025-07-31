"""
HTTP client utilities for inter-service communication.
"""
import aiohttp
from typing import Optional, Dict, Any


class AsyncHTTPClient:
    """Async HTTP client for inter-service communication."""
    
    def __init__(self, timeout: int = 30) -> None:
        """
        Initialize HTTP client.
        
        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self) -> 'AsyncHTTPClient':
        """Enter async context manager."""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self
    
    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit async context manager."""
        if self.session:
            await self.session.close()
    
    async def get(self, url: str, headers: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Perform GET request.
        
        Args:
            url: Request URL
            headers: Optional request headers
            
        Returns:
            JSON response as dictionary
        """
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")
            
        async with self.session.get(url, headers=headers) as response:
            response.raise_for_status()
            return await response.json()
    
    async def post(self, url: str, data: Optional[Dict[str, Any]] = None, 
                   headers: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Perform POST request.
        
        Args:
            url: Request URL
            data: Request data as dictionary
            headers: Optional request headers
            
        Returns:
            JSON response as dictionary
        """
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")
            
        async with self.session.post(url, json=data, headers=headers) as response:
            response.raise_for_status()
            return await response.json()
    
    async def put(self, url: str, data: Optional[Dict[str, Any]] = None, 
                  headers: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Perform PUT request.
        
        Args:
            url: Request URL
            data: Request data as dictionary
            headers: Optional request headers
            
        Returns:
            JSON response as dictionary
        """
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")
            
        async with self.session.put(url, json=data, headers=headers) as response:
            response.raise_for_status()
            return await response.json()
    
    async def delete(self, url: str, headers: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Perform DELETE request.
        
        Args:
            url: Request URL
            headers: Optional request headers
            
        Returns:
            JSON response as dictionary
        """
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")
            
        async with self.session.delete(url, headers=headers) as response:
            response.raise_for_status()
            return await response.json()
