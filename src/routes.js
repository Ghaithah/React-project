import Login from "./components/Login"
import MovieSearch from "./components/MovieSearch"
import ProtectedRoute from "./components/Protectedroute"
import RequireProfile from "./components/RequireProfile"
import ProfileSelector from "./components/ProfileSelector"

export const routes=[
    {path:'/', element:<ProtectedRoute><RequireProfile><MovieSearch/></RequireProfile></ProtectedRoute>},
    {path:'/movies', element:<ProtectedRoute><RequireProfile><MovieSearch/></RequireProfile></ProtectedRoute>},
    {path:'/profiles', element:<ProtectedRoute><ProfileSelector/></ProtectedRoute>},
    {path:'/login', element:<Login/>},
]