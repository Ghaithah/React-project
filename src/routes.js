import Login from "./components/Login"
import MovieSearch from "./components/MovieSearch"
import ProtectedRoute from "./components/Protectedroute"

export const routes=[
    {path:'/', element:<ProtectedRoute><MovieSearch/></ProtectedRoute>},
    {path:'/movies', element:<ProtectedRoute><MovieSearch/></ProtectedRoute>},
    {path:'/login', element:<Login/>},
]