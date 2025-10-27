import { Router } from "express";
 class BaseRouter {
    router;
    constructor() {
        this.router = Router()
    }
 }

 export default BaseRouter