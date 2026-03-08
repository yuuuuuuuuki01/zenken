import axios from 'axios';

async function createClientUser() {
    try {
        console.log("Registering fixed client user...");
        const resReg = await axios.post("http://127.0.0.1:8081/auth/register", {
            email: "client@gigacompute.local",
            password: "password123",
            name: "GigaCompute Client"
        });
        console.log("Client user created successfully!");
        console.log("Email: client@gigacompute.local");
        console.log("Password: password123");
        console.log("Token:", resReg.data.token);
    } catch (e: any) {
        if (e.response && e.response.status === 400 && e.response.data.error === "User already exists") {
            console.log("Client user (client@gigacompute.local) already exists.");
            console.log("Email: client@gigacompute.local");
            console.log("Password: password123");
        } else {
            console.error("Test Error:", e.response?.data || e.message);
        }
    }
}
createClientUser();
